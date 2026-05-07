import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  onSnapshot,
  updateDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const STORAGE_ROOM = "ce_room_id";
const STORAGE_PASS = "ce_room_pass";

let app;
let auth;
let db;
let roomRef = null;
let roomUnsub = null;
let currentStep = "";
let cachedPassphrase = "";
let cachedCryptoKey = null;
let cachedSalt = "";

function $(id) {
  return document.getElementById(id);
}

function trim(s) {
  return (s || "").trim();
}

function defaultName(raw, fb) {
  const t = trim(raw);
  return t.length ? t : fb;
}

function showError(msg) {
  const b = $("banner-error");
  b.textContent = msg;
  b.hidden = false;
}

function clearError() {
  const b = $("banner-error");
  b.hidden = true;
  b.textContent = "";
}

function configOk() {
  return (
    firebaseConfig.apiKey &&
    firebaseConfig.apiKey !== "REPLACE_ME" &&
    firebaseConfig.projectId &&
    firebaseConfig.projectId !== "REPLACE_ME"
  );
}

function randomRoomId() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (x) => x.toString(16).padStart(2, "0")).join("");
}

function bufToB64(buf) {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function b64ToBuf(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function sha256Hex(str) {
  const buf = new TextEncoder().encode(str);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function makeVerifier(passphrase, saltB64) {
  return sha256Hex(passphrase + "|" + saltB64);
}

async function deriveAesKey(passphrase, saltB64) {
  const salt = b64ToBuf(saltB64);
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: 120000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function getCryptoKey(passphrase, saltB64) {
  if (
    cachedCryptoKey &&
    cachedPassphrase === passphrase &&
    cachedSalt === saltB64
  ) {
    return cachedCryptoKey;
  }
  const key = await deriveAesKey(passphrase, saltB64);
  cachedCryptoKey = key;
  cachedPassphrase = passphrase;
  cachedSalt = saltB64;
  return key;
}

async function encryptText(plaintext, key) {
  const enc = new TextEncoder();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    enc.encode(plaintext)
  );
  const pack = {
    iv: bufToB64(iv),
    d: bufToB64(new Uint8Array(ct)),
  };
  return JSON.stringify(pack);
}

async function decryptText(jsonStr, key) {
  if (!jsonStr || !trim(jsonStr)) return "";
  const pack = JSON.parse(jsonStr);
  const iv = b64ToBuf(pack.iv);
  const data = b64ToBuf(pack.d);
  const dec = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    data
  );
  return new TextDecoder().decode(dec);
}

function hideWorkflowPanels() {
  [
    "panel-setup",
    "panel-a",
    "panel-wait-a",
    "panel-after-a-host",
    "panel-handoff",
    "panel-b",
    "panel-wait-b",
    "panel-reveal",
  ].forEach((id) => {
    $(id).hidden = true;
  });
}

function showOnlyWorkflow(panelId) {
  hideWorkflowPanels();
  $(panelId).hidden = false;
}

function setLobbyVisible(on) {
  $("panel-lobby").hidden = !on;
  $("panel-room-bar").hidden = on;
}

function roleOf(uid, data) {
  if (uid === data.hostUid) return "host";
  if (uid === data.guestUid) return "guest";
  return null;
}

function applyNameLabels(data) {
  const na = defaultName(data.nameA, "参与者 A");
  const nb = defaultName(data.nameB, "参与者 B");
  $("label-name-a-step").textContent = na;
  $("label-name-b-step").textContent = nb;
  $("label-name-a-done").textContent = na;
  $("label-name-b-wait").textContent = nb;
  $("btn-text-continue-b").textContent = nb + " 开始填写";
}

async function renderRoom(uid, data, passphrase) {
  currentStep = data.step || "setup";
  applyNameLabels(data);

  $("topic").value = data.topic || "";
  $("name-a").value = data.nameA || "";
  $("name-b").value = data.nameB || "";
  $("topic-display-a").textContent = data.topic || "（未命名事项）";
  $("topic-display-b").textContent = data.topic || "（未命名事项）";
  $("topic-display-reveal").textContent = data.topic || "（未命名事项）";

  $("display-room-id").textContent = roomRef.id;
  $("wait-guest-hint").hidden = !!data.guestUid;

  const key = await getCryptoKey(passphrase, data.salt);
  const ro = roleOf(uid, data);

  $("confirm-privacy").checked = !!data.confirmPrivacy;
  $("btn-submit-b").disabled = !data.confirmPrivacy;

  if (ro === null) {
    showError("你不是本房间的成员，请重新加入。");
    leaveRoom();
    return;
  }

  const step = data.step || "setup";

  if (step === "setup") {
    showOnlyWorkflow("panel-setup");
    return;
  }

  if (step === "a") {
    if (ro === "host") {
      let plain = "";
      try {
        plain = await decryptText(data.expectationAEnc, key);
      } catch (e) {
        plain = "";
      }
      $("expect-a").value = plain;
      showOnlyWorkflow("panel-a");
      return;
    }
    showOnlyWorkflow("panel-wait-a");
    return;
  }

  if (step === "handoff") {
    if (ro === "host") {
      showOnlyWorkflow("panel-after-a-host");
      return;
    }
    showOnlyWorkflow("panel-handoff");
    return;
  }

  if (step === "b") {
    if (ro === "guest") {
      let plain = "";
      try {
        plain = await decryptText(data.expectationBEnc, key);
      } catch (e) {
        plain = "";
      }
      $("expect-b").value = plain;
      showOnlyWorkflow("panel-b");
      return;
    }
    showOnlyWorkflow("panel-wait-b");
    return;
  }

  if (step === "reveal") {
    let ta = "";
    let tb = "";
    try {
      ta = await decryptText(data.expectationAEnc, key);
      tb = await decryptText(data.expectationBEnc, key);
    } catch (e) {
      showError(
        "解密失败，请确认两人使用同一共享口令与同一房间号。"
      );
    }
    const na = defaultName(data.nameA, "参与者 A");
    const nb = defaultName(data.nameB, "参与者 B");
    $("reveal-title-a").textContent = na + "的预期";
    $("reveal-title-b").textContent = nb + "的预期";
    $("reveal-text-a").textContent = trim(ta) || "（未填写）";
    $("reveal-text-b").textContent = trim(tb) || "（未填写）";
    showOnlyWorkflow("panel-reveal");
    return;
  }

  showOnlyWorkflow("panel-setup");
}

function attachRoomListener(ref, passphrase) {
  if (roomUnsub) {
    roomUnsub();
    roomUnsub = null;
  }
  roomRef = ref;
  cachedPassphrase = passphrase;
  roomUnsub = onSnapshot(
    ref,
    async (snap) => {
      clearError();
      if (!snap.exists()) {
        showError("房间已删除或不存在。");
        leaveRoom();
        return;
      }
      const uid = auth.currentUser && auth.currentUser.uid;
      if (!uid) return;
      await renderRoom(uid, snap.data(), passphrase);
    },
    (err) => {
      console.error(err);
      showError(err.message || "同步出错，请检查网络与 Firebase 配置。");
    }
  );
}

async function ensureAuth() {
  if (auth.currentUser) return auth.currentUser;
  const cred = await signInAnonymously(auth);
  return cred.user;
}

async function createRoom(passphrase) {
  if (trim(passphrase).length < 8) {
    alert("共享口令建议至少 8 个字符，请与对方私下约定同一句。");
    return;
  }
  clearError();
  await ensureAuth();
  const uid = auth.currentUser.uid;
  const roomId = randomRoomId();
  const saltBytes = crypto.getRandomValues(new Uint8Array(16));
  const saltB64 = bufToB64(saltBytes);
  const verifier = await makeVerifier(passphrase, saltB64);

  const ref = doc(db, "rooms", roomId);
  await setDoc(ref, {
    hostUid: uid,
    guestUid: null,
    salt: saltB64,
    verifier,
    topic: "",
    nameA: "",
    nameB: "",
    expectationAEnc: "",
    expectationBEnc: "",
    step: "setup",
    confirmPrivacy: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  sessionStorage.setItem(STORAGE_ROOM, roomId);
  sessionStorage.setItem(STORAGE_PASS, passphrase);

  setLobbyVisible(false);
  attachRoomListener(ref, passphrase);
}

async function joinRoom(roomId, passphrase) {
  roomId = trim(roomId).toLowerCase();
  if (!/^[a-f0-9]{32}$/.test(roomId)) {
    alert("房间号应为 32 位小写十六进制字符，请向对方核对复制是否完整。");
    return;
  }
  if (trim(passphrase).length < 8) {
    alert("请输入与对方一致的共享口令（至少 8 个字符）。");
    return;
  }
  clearError();
  await ensureAuth();
  const uid = auth.currentUser.uid;
  const ref = doc(db, "rooms", roomId);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    alert("找不到该房间，请检查房间号。");
    return;
  }
  const data = snap.data();
  const v = await makeVerifier(passphrase, data.salt);
  if (v !== data.verifier) {
    alert("共享口令不正确，请与对方核对。");
    return;
  }

  if (data.hostUid === uid) {
    sessionStorage.setItem(STORAGE_ROOM, roomId);
    sessionStorage.setItem(STORAGE_PASS, passphrase);
    setLobbyVisible(false);
    attachRoomListener(ref, passphrase);
    return;
  }

  if (data.guestUid && data.guestUid !== uid) {
    alert("该房间已有第二位成员，无法再加入。");
    return;
  }

  if (!data.guestUid) {
    await updateDoc(ref, {
      guestUid: uid,
      updatedAt: serverTimestamp(),
    });
  }

  sessionStorage.setItem(STORAGE_ROOM, roomId);
  sessionStorage.setItem(STORAGE_PASS, passphrase);
  setLobbyVisible(false);
  attachRoomListener(ref, passphrase);
}

function leaveRoom() {
  if (roomUnsub) {
    roomUnsub();
    roomUnsub = null;
  }
  roomRef = null;
  cachedCryptoKey = null;
  cachedPassphrase = "";
  cachedSalt = "";
  sessionStorage.removeItem(STORAGE_ROOM);
  sessionStorage.removeItem(STORAGE_PASS);
  hideWorkflowPanels();
  setLobbyVisible(true);
  $("panel-setup").hidden = true;
  clearError();
}

let setupSaveTimer = null;
function scheduleSetupSave() {
  if (!roomRef || currentStep !== "setup") return;
  clearTimeout(setupSaveTimer);
  setupSaveTimer = setTimeout(async () => {
    try {
      await updateDoc(roomRef, {
        topic: trim($("topic").value),
        nameA: trim($("name-a").value),
        nameB: trim($("name-b").value),
        updatedAt: serverTimestamp(),
      });
    } catch (e) {
      console.error(e);
    }
  }, 500);
}

async function initFirebase() {
  if (!configOk()) {
    showError(
      "请编辑 firebase-config.js，填入 Firebase 控制台中的 Web 应用配置后再刷新页面。"
    );
    return false;
  }
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
  return true;
}

function prefillRoomFromUrl() {
  try {
    const params = new URLSearchParams(window.location.search);
    const r = trim(params.get("room") || "").toLowerCase();
    if (/^[a-f0-9]{32}$/.test(r)) {
      $("join-room-id").value = r;
    }
  } catch (e) {}
}

async function tryReconnect() {
  const roomId = sessionStorage.getItem(STORAGE_ROOM);
  const pass = sessionStorage.getItem(STORAGE_PASS);
  if (!roomId || !pass || !configOk()) return;
  if (roomRef && roomRef.id === roomId) return;
  try {
    await ensureAuth();
    const ref = doc(db, "rooms", roomId);
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new Error("missing");
    const data = snap.data();
    const v = await makeVerifier(pass, data.salt);
    if (v !== data.verifier) throw new Error("bad verifier");
    const uid = auth.currentUser.uid;
    if (data.hostUid !== uid && data.guestUid !== uid && data.guestUid)
      throw new Error("not member");
    setLobbyVisible(false);
    attachRoomListener(ref, pass);
  } catch (e) {
    sessionStorage.removeItem(STORAGE_ROOM);
    sessionStorage.removeItem(STORAGE_PASS);
  }
}

function wireUi() {
  $("btn-create-room").addEventListener("click", async () => {
    const pass = $("lobby-pass").value;
    try {
      await createRoom(pass);
    } catch (e) {
      console.error(e);
      alert(e.message || "创建失败，请检查 Firebase 规则与网络。");
    }
  });

  $("btn-join-room").addEventListener("click", async () => {
    const rid = $("join-room-id").value;
    const pass = $("join-pass").value;
    try {
      await joinRoom(rid, pass);
    } catch (e) {
      console.error(e);
      alert(e.message || "加入失败。");
    }
  });

  $("btn-copy-room").addEventListener("click", async () => {
    const id = $("display-room-id").textContent;
    const url =
      location.origin + location.pathname + "?room=" + encodeURIComponent(id);
    const text = "房间号：" + id + "\n链接：" + url;
    try {
      await navigator.clipboard.writeText(text);
      alert("已复制房间号与链接。");
    } catch (e) {
      prompt("请手动复制：", text);
    }
  });

  ["topic", "name-a", "name-b"].forEach((id) => {
    $(id).addEventListener("input", scheduleSetupSave);
  });

  $("btn-start").addEventListener("click", async () => {
    const topic = trim($("topic").value);
    if (!topic) {
      alert("请先写一下：我们要讨论的事是什么。");
      $("topic").focus();
      return;
    }
    const pass = sessionStorage.getItem(STORAGE_PASS);
    if (!roomRef || !pass) return;
    try {
      await updateDoc(roomRef, {
        topic,
        nameA: trim($("name-a").value),
        nameB: trim($("name-b").value),
        step: "a",
        updatedAt: serverTimestamp(),
      });
    } catch (e) {
      alert(e.message || "保存失败");
    }
  });

  $("btn-submit-a").addEventListener("click", async () => {
    const text = trim($("expect-a").value);
    if (!text) {
      alert("写几句话就好：你希望我这边怎么做，或你最在意的是什么。");
      $("expect-a").focus();
      return;
    }
    const pass = sessionStorage.getItem(STORAGE_PASS);
    if (!roomRef || !pass) return;
    const snap = await getDoc(roomRef);
    const data = snap.data();
    const key = await getCryptoKey(pass, data.salt);
    const enc = await encryptText(text, key);
    try {
      await updateDoc(roomRef, {
        expectationAEnc: enc,
        step: "handoff",
        updatedAt: serverTimestamp(),
      });
    } catch (e) {
      alert(e.message || "提交失败");
    }
  });

  $("btn-continue-b").addEventListener("click", async () => {
    if (!roomRef) return;
    try {
      await updateDoc(roomRef, {
        step: "b",
        updatedAt: serverTimestamp(),
      });
    } catch (e) {
      alert(e.message || "失败");
    }
  });

  $("confirm-privacy").addEventListener("change", async () => {
    const checked = $("confirm-privacy").checked;
    $("btn-submit-b").disabled = !checked;
    if (!roomRef) return;
    try {
      await updateDoc(roomRef, {
        confirmPrivacy: checked,
        updatedAt: serverTimestamp(),
      });
    } catch (e) {
      console.error(e);
    }
  });

  $("btn-submit-b").addEventListener("click", async () => {
    if (!$("confirm-privacy").checked) return;
    const text = trim($("expect-b").value);
    if (!text) {
      alert("同样写几句：你的预期、顾虑或愿望都可以。");
      $("expect-b").focus();
      return;
    }
    const pass = sessionStorage.getItem(STORAGE_PASS);
    if (!roomRef || !pass) return;
    const snap = await getDoc(roomRef);
    const data = snap.data();
    const key = await getCryptoKey(pass, data.salt);
    const enc = await encryptText(text, key);
    try {
      await updateDoc(roomRef, {
        expectationBEnc: enc,
        step: "reveal",
        updatedAt: serverTimestamp(),
      });
    } catch (e) {
      alert(e.message || "提交失败");
    }
  });

  $("btn-new").addEventListener("click", async () => {
    if (
      !confirm(
        "将离开当前房间并清除本机缓存的房间信息。云端聊天记录仍会保留在 Firebase，除非你们在控制台删除。"
      )
    ) {
      return;
    }
    leaveRoom();
    $("lobby-pass").value = "";
    $("join-room-id").value = "";
    $("join-pass").value = "";
    $("expect-a").value = "";
    $("expect-b").value = "";
    $("confirm-privacy").checked = false;
    $("btn-submit-b").disabled = true;
  });

  $("btn-copy").addEventListener("click", async () => {
    const pass = sessionStorage.getItem(STORAGE_PASS);
    if (!roomRef || !pass) return;
    const snap = await getDoc(roomRef);
    const data = snap.data();
    const key = await getCryptoKey(pass, data.salt);
    let ta = "";
    let tb = "";
    try {
      ta = await decryptText(data.expectationAEnc, key);
      tb = await decryptText(data.expectationBEnc, key);
    } catch (e) {
      alert("复制失败：无法解密。");
      return;
    }
    const na = defaultName(data.nameA, "参与者 A");
    const nb = defaultName(data.nameB, "参与者 B");
    const blob =
      "事项：" +
      (data.topic || "") +
      "\n\n" +
      na +
      "：\n" +
      trim(ta) +
      "\n\n" +
      nb +
      "：\n" +
      trim(tb);
    try {
      await navigator.clipboard.writeText(blob);
      alert("已复制到剪贴板。");
    } catch (e) {
      prompt("请手动复制：", blob);
    }
  });
}

async function boot() {
  prefillRoomFromUrl();
  wireUi();
  const ok = await initFirebase();
  if (!ok) return;

  onAuthStateChanged(auth, async (user) => {
    if (!user) return;
    await tryReconnect();
  });

  try {
    await signInAnonymously(auth);
  } catch (e) {
    showError(
      "匿名登录失败：请在 Firebase 控制台 → Authentication → Sign-in method 中启用「匿名」登录。"
    );
    console.error(e);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
