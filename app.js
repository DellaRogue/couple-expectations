(function () {
  "use strict";

  var STORAGE_KEY = "couple-expectations-session-v1";

  var els = {
    panelSetup: document.getElementById("panel-setup"),
    panelA: document.getElementById("panel-a"),
    panelHandoff: document.getElementById("panel-handoff"),
    panelB: document.getElementById("panel-b"),
    panelReveal: document.getElementById("panel-reveal"),
    topic: document.getElementById("topic"),
    nameA: document.getElementById("name-a"),
    nameB: document.getElementById("name-b"),
    btnStart: document.getElementById("btn-start"),
    topicDisplayA: document.getElementById("topic-display-a"),
    topicDisplayB: document.getElementById("topic-display-b"),
    topicDisplayReveal: document.getElementById("topic-display-reveal"),
    labelNameAStep: document.getElementById("label-name-a-step"),
    labelNameBStep: document.getElementById("label-name-b-step"),
    labelNameADone: document.getElementById("label-name-a-done"),
    labelNameBHandoff: document.getElementById("label-name-b-handoff"),
    btnTextContinueB: document.getElementById("btn-text-continue-b"),
    expectA: document.getElementById("expect-a"),
    expectB: document.getElementById("expect-b"),
    btnSubmitA: document.getElementById("btn-submit-a"),
    btnContinueB: document.getElementById("btn-continue-b"),
    btnSubmitB: document.getElementById("btn-submit-b"),
    confirmPrivacy: document.getElementById("confirm-privacy"),
    revealTitleA: document.getElementById("reveal-title-a"),
    revealTitleB: document.getElementById("reveal-title-b"),
    revealTextA: document.getElementById("reveal-text-a"),
    revealTextB: document.getElementById("reveal-text-b"),
    btnCopy: document.getElementById("btn-copy"),
    btnNew: document.getElementById("btn-new"),
  };

  function trimOrEmpty(s) {
    return (s || "").trim();
  }

  function defaultName(raw, fallback) {
    var t = trimOrEmpty(raw);
    return t.length ? t : fallback;
  }

  function loadState() {
    try {
      var raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  function saveState(state) {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function clearState() {
    sessionStorage.removeItem(STORAGE_KEY);
  }

  function showPanel(id) {
    var panels = ["panel-setup", "panel-a", "panel-handoff", "panel-b", "panel-reveal"];
    panels.forEach(function (pid) {
      document.getElementById(pid).hidden = pid !== id;
    });
  }

  function applyNames(state) {
    var na = defaultName(state.nameA, "参与者 A");
    var nb = defaultName(state.nameB, "参与者 B");
    els.labelNameAStep.textContent = na;
    els.labelNameBStep.textContent = nb;
    els.labelNameADone.textContent = na;
    els.labelNameBHandoff.textContent = nb;
    els.btnTextContinueB.textContent = nb + " 开始填写";
    return { na: na, nb: nb };
  }

  function hydrateFromState(state) {
    var names = applyNames(state);
    els.topic.value = state.topic || "";
    els.nameA.value = state.nameA || "";
    els.nameB.value = state.nameB || "";
    els.topicDisplayA.textContent = state.topic || "（未命名事项）";
    els.topicDisplayB.textContent = state.topic || "（未命名事项）";
    els.topicDisplayReveal.textContent = state.topic || "（未命名事项）";
    els.expectA.value = state.expectationA || "";
    els.expectB.value = state.expectationB || "";
    els.confirmPrivacy.checked = !!state.confirmPrivacy;

    if (state.step === "a") {
      showPanel("panel-a");
    } else if (state.step === "handoff") {
      showPanel("panel-handoff");
    } else if (state.step === "b") {
      updateSubmitBDisabled(state);
      showPanel("panel-b");
    } else if (state.step === "reveal") {
      fillReveal(state, names.na, names.nb);
      showPanel("panel-reveal");
    } else {
      showPanel("panel-setup");
    }
  }

  function fillReveal(state, na, nb) {
    els.revealTitleA.textContent = na + "的预期";
    els.revealTitleB.textContent = nb + "的预期";
    els.revealTextA.textContent = trimOrEmpty(state.expectationA) || "（未填写）";
    els.revealTextB.textContent = trimOrEmpty(state.expectationB) || "（未填写）";
  }

  function updateSubmitBDisabled(state) {
    var ok = els.confirmPrivacy.checked;
    els.btnSubmitB.disabled = !ok;
  }

  function init() {
    var state = loadState();
    if (state && state.step) {
      hydrateFromState(state);
    } else {
      showPanel("panel-setup");
    }

    els.btnStart.addEventListener("click", function () {
      var topic = trimOrEmpty(els.topic.value);
      if (!topic) {
        alert("请先简单写一下：我们要讨论的事是什么。");
        els.topic.focus();
        return;
      }
      var next = {
        step: "a",
        topic: topic,
        nameA: trimOrEmpty(els.nameA.value),
        nameB: trimOrEmpty(els.nameB.value),
        expectationA: "",
        expectationB: "",
        confirmPrivacy: false,
      };
      saveState(next);
      hydrateFromState(next);
    });

    els.btnSubmitA.addEventListener("click", function () {
      var state = loadState();
      if (!state || state.step !== "a") return;
      var text = trimOrEmpty(els.expectA.value);
      if (!text) {
        alert("写几句话就好：你希望我这边怎么做，或你最在意的是什么。");
        els.expectA.focus();
        return;
      }
      state.expectationA = text;
      state.step = "handoff";
      saveState(state);
      hydrateFromState(state);
    });

    els.btnContinueB.addEventListener("click", function () {
      var state = loadState();
      if (!state || state.step !== "handoff") return;
      state.step = "b";
      saveState(state);
      hydrateFromState(state);
    });

    els.confirmPrivacy.addEventListener("change", function () {
      var state = loadState();
      if (!state) return;
      state.confirmPrivacy = els.confirmPrivacy.checked;
      saveState(state);
      updateSubmitBDisabled(state);
    });

    els.btnSubmitB.addEventListener("click", function () {
      var state = loadState();
      if (!state || state.step !== "b") return;
      if (!els.confirmPrivacy.checked) return;
      var text = trimOrEmpty(els.expectB.value);
      if (!text) {
        alert("同样写几句：你的预期、顾虑或愿望都可以。");
        els.expectB.focus();
        return;
      }
      state.expectationB = text;
      state.step = "reveal";
      saveState(state);
      hydrateFromState(state);
    });

    els.btnNew.addEventListener("click", function () {
      clearState();
      els.topic.value = "";
      els.nameA.value = "";
      els.nameB.value = "";
      els.expectA.value = "";
      els.expectB.value = "";
      els.confirmPrivacy.checked = false;
      els.btnSubmitB.disabled = true;
      showPanel("panel-setup");
    });

    els.btnCopy.addEventListener("click", function () {
      var state = loadState();
      if (!state) return;
      var na = defaultName(state.nameA, "参与者 A");
      var nb = defaultName(state.nameB, "参与者 B");
      var lines = [
        "事项：" + (state.topic || ""),
        "",
        na + "：",
        trimOrEmpty(state.expectationA),
        "",
        nb + "：",
        trimOrEmpty(state.expectationB),
      ];
      var blob = lines.join("\n");
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(blob).then(
          function () {
            alert("已复制到剪贴板。");
          },
          function () {
            fallbackCopy(blob);
          }
        );
      } else {
        fallbackCopy(blob);
      }
    });

    function fallbackCopy(text) {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
        alert("已复制到剪贴板。");
      } catch (e) {
        alert("复制失败，请手动选中揭晓页内容复制。");
      }
      document.body.removeChild(ta);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
