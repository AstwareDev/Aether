// Injected into every page the in-app browser loads. It reports page metadata
// (title, favicon, url) and picked elements back to the host through the
// `__AETHER_SIGNAL_BASE__` custom protocol, which is the only channel a remote
// origin can reach - Tauri's IPC is closed to remote content.
//
// Console and network belong to WebView2's own inspector, which the pane docks
// beside the page, so nothing here patches them.
//
// Keep this file plain ASCII with no control characters: WebView2 registers it
// as a NUL-terminated string, so a stray NUL silently truncates the script and
// nothing here runs at all.
(function () {
  if (window.__aetherProbe) return;
  window.__aetherProbe = true;

  var BASE = "__AETHER_SIGNAL_BASE__";
  var ENDPOINT = BASE + "signal";
  var nativeFetch = window.fetch && window.fetch.bind(window);

  var queue = [];
  var timer = null;

  function send() {
    timer = null;
    if (!queue.length || !nativeFetch) return;
    var batch = queue.splice(0, queue.length);
    var body;
    try {
      body = JSON.stringify(batch);
    } catch (e) {
      return;
    }
    try {
      nativeFetch(ENDPOINT, {
        method: "POST",
        mode: "no-cors",
        cache: "no-store",
        credentials: "omit",
        keepalive: true,
        body: body,
      }).catch(function () {});
    } catch (e) {
      /* channel unavailable - the panel just stays empty */
    }
  }

  function post(event) {
    event.time = Date.now();
    queue.push(event);
    if (queue.length > 300) queue.splice(0, queue.length - 300);
    if (timer === null) timer = setTimeout(send, 40);
  }

  function absolute(u) {
    try {
      return new URL(u, location.href).href;
    } catch (e) {
      return String(u);
    }
  }

  // -- page metadata ---------------------------------------------------
  var lastMeta = "";

  function iconHref() {
    var best = null;
    var bestSize = -1;
    var links;
    try {
      links = document.querySelectorAll(
        'link[rel~="icon" i], link[rel="shortcut icon" i], link[rel="apple-touch-icon" i]',
      );
    } catch (e) {
      links = [];
    }
    for (var i = 0; i < links.length; i++) {
      var href = links[i].getAttribute("href");
      if (!href) continue;
      var size = parseInt(links[i].getAttribute("sizes") || "", 10);
      if (isNaN(size)) size = 0;
      if (size > bestSize) {
        bestSize = size;
        best = href;
      }
    }
    // No declared icon: fall back to the conventional location.
    return best ? absolute(best) : location.origin + "/favicon.ico";
  }

  function reportMeta() {
    var payload = { t: "meta", url: location.href, title: document.title || "", icon: iconHref() };
    var key = payload.url + "|" + payload.title + "|" + payload.icon;
    if (key === lastMeta) return;
    lastMeta = key;
    post(payload);
  }

  function watchMeta() {
    reportMeta();
    if (!document.head) return;
    try {
      new MutationObserver(reportMeta).observe(document.head, {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true,
        attributeFilter: ["href", "rel", "sizes"],
      });
    } catch (e) {}
  }

  ["pushState", "replaceState"].forEach(function (method) {
    var original = history[method];
    if (!original) return;
    history[method] = function () {
      var result = original.apply(this, arguments);
      setTimeout(reportMeta, 0);
      return result;
    };
  });
  window.addEventListener("popstate", function () {
    setTimeout(reportMeta, 0);
  });
  window.addEventListener("hashchange", function () {
    setTimeout(reportMeta, 0);
  });
  window.addEventListener("load", reportMeta);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", watchMeta);
  } else {
    watchMeta();
  }

  // -- element inspector -----------------------------------------------
  // Draws into an overlay this script owns and reports the picked node to the
  // panel. Nothing here mutates the page itself.

  var overlay = null;
  var badge = null;
  var inspecting = false;

  var STYLE_PROPS = [
    "display",
    "position",
    "top",
    "right",
    "bottom",
    "left",
    "z-index",
    "width",
    "height",
    "margin",
    "padding",
    "border",
    "border-radius",
    "box-sizing",
    "overflow",
    "flex-direction",
    "justify-content",
    "align-items",
    "gap",
    "grid-template-columns",
    "color",
    "background-color",
    "background-image",
    "font-family",
    "font-size",
    "font-weight",
    "line-height",
    "text-align",
    "opacity",
    "transform",
    "transition",
    "box-shadow",
    "cursor",
  ];

  function ensureOverlay() {
    if (overlay && overlay.parentNode) return;
    var host = document.body || document.documentElement;
    if (!host) return;
    overlay = document.createElement("div");
    overlay.setAttribute("data-aether-overlay", "");
    overlay.style.cssText =
      "position:fixed;z-index:2147483647;pointer-events:none;display:none;" +
      "box-sizing:border-box;background:rgba(88,166,255,0.22);" +
      "outline:1px solid rgba(88,166,255,0.9);outline-offset:-1px;";
    badge = document.createElement("div");
    badge.setAttribute("data-aether-overlay", "");
    badge.style.cssText =
      "position:fixed;z-index:2147483647;pointer-events:none;display:none;" +
      "font:11px/1.5 ui-monospace,Menlo,Consolas,monospace;color:#fff;" +
      "background:#1f6feb;padding:2px 6px;border-radius:3px;white-space:nowrap;" +
      "box-shadow:0 2px 8px rgba(0,0,0,0.4);";
    host.appendChild(overlay);
    host.appendChild(badge);
  }

  function isOverlay(el) {
    return !!(el && el.getAttribute && el.getAttribute("data-aether-overlay") !== null);
  }

  function describe(el) {
    var out = el.tagName ? el.tagName.toLowerCase() : "?";
    if (el.id) out += "#" + el.id;
    var cls = typeof el.className === "string" ? el.className.trim() : "";
    if (cls) out += "." + cls.split(/\s+/).slice(0, 3).join(".");
    return out;
  }

  function drawHighlight(el) {
    ensureOverlay();
    if (!overlay) return;
    if (!el || !el.getBoundingClientRect) {
      clearHighlight();
      return;
    }
    var r = el.getBoundingClientRect();
    overlay.style.display = "block";
    overlay.style.left = r.left + "px";
    overlay.style.top = r.top + "px";
    overlay.style.width = r.width + "px";
    overlay.style.height = r.height + "px";

    badge.style.display = "block";
    badge.textContent = describe(el) + "  " + Math.round(r.width) + " x " + Math.round(r.height);
    // Prefer above the element, drop below when there is no room.
    var top = r.top - 22;
    badge.style.top = (top < 0 ? Math.min(r.bottom + 4, innerHeight - 24) : top) + "px";
    badge.style.left = Math.max(0, Math.min(r.left, innerWidth - 200)) + "px";
  }

  function clearHighlight() {
    if (overlay) overlay.style.display = "none";
    if (badge) badge.style.display = "none";
  }

  /** A selector the host can hand back to re-select this node later. */
  function pathOf(el) {
    var parts = [];
    var node = el;
    while (node && node.nodeType === 1 && node !== document.documentElement) {
      var parent = node.parentNode;
      if (!parent || parent.nodeType !== 1) break;
      var index = 1;
      var sibling = node;
      while ((sibling = sibling.previousElementSibling)) index++;
      parts.unshift(node.tagName.toLowerCase() + ":nth-child(" + index + ")");
      node = parent;
    }
    parts.unshift("html");
    return parts.join(" > ");
  }

  function cssEscape(value) {
    if (window.CSS && CSS.escape) return CSS.escape(value);
    return String(value).replace(/([^\w-])/g, "\\$1");
  }

  function unique(selector) {
    try {
      return document.querySelectorAll(selector).length === 1;
    } catch (e) {
      return false;
    }
  }

  /**
   * The shortest selector that still identifies this element on its own, so a
   * reader can find it again. Falls back to the positional path.
   */
  function bestSelector(el) {
    if (el.id && unique("#" + cssEscape(el.id))) return "#" + cssEscape(el.id);

    var testId =
      el.getAttribute &&
      (el.getAttribute("data-testid") || el.getAttribute("data-test-id") || el.getAttribute("data-test"));
    if (testId) {
      var byTest = '[data-testid="' + testId + '"]';
      if (unique(byTest)) return byTest;
    }

    var tag = el.tagName ? el.tagName.toLowerCase() : "*";
    // Hashed utility/CSS-in-JS class names identify nothing a reader can use.
    var usable = classesOf(el).filter(function (c) {
      return c.length < 40 && !/^(ng-|css-|sc-|jsx-|emotion-)/.test(c) && !/^[a-z]+-[a-f0-9]{6,}$/i.test(c);
    });
    for (var take = 1; take <= Math.min(3, usable.length); take++) {
      var selector =
        tag +
        "." +
        usable
          .slice(0, take)
          .map(cssEscape)
          .join(".");
      if (unique(selector)) return selector;
    }

    var role = el.getAttribute && el.getAttribute("role");
    var aria = el.getAttribute && el.getAttribute("aria-label");
    if (aria) {
      var byAria = tag + '[aria-label="' + aria.replace(/"/g, '\\"') + '"]';
      if (unique(byAria)) return byAria;
    }
    if (role) {
      var byRole = tag + '[role="' + role + '"]';
      if (unique(byRole)) return byRole;
    }

    return pathOf(el);
  }

  function summarizeProps(props) {
    var out = [];
    for (var key in props) {
      if (key === "children" || key === "key" || key === "ref") continue;
      if (out.length >= 25) break;
      var value = props[key];
      var kind = typeof value;
      var text;
      if (value === null) text = "null";
      else if (kind === "undefined") text = "undefined";
      else if (kind === "function") text = "[function]";
      else if (kind === "object") {
        text = Array.isArray(value) ? "[array(" + value.length + ")]" : "[object]";
      } else if (kind === "string") text = JSON.stringify(value.slice(0, 80));
      else text = String(value);
      out.push([key, text]);
    }
    return out;
  }

  /**
   * Which framework component rendered this node. Enormously more useful than
   * the DOM alone when the reader has to go find the source.
   */
  function frameworkInfo(el) {
    var info = { framework: "", stack: [], props: [], source: "" };

    var fiberKey = null;
    var propsKey = null;
    var own = Object.keys(el);
    for (var i = 0; i < own.length; i++) {
      var key = own[i];
      if (key.lastIndexOf("__reactFiber$", 0) === 0) fiberKey = key;
      else if (key.lastIndexOf("__reactInternalInstance$", 0) === 0) fiberKey = key;
      else if (key.lastIndexOf("__reactProps$", 0) === 0) propsKey = key;
    }

    if (fiberKey) {
      info.framework = "React";
      var fiber = el[fiberKey];
      var guard = 0;
      while (fiber && guard++ < 60) {
        var type = fiber.type || fiber.elementType;
        var name = null;
        if (typeof type === "function") {
          name = type.displayName || type.name;
        } else if (type && typeof type === "object") {
          // memo() and forwardRef() wrap the real component one level down.
          var inner = type.render || type.type;
          name =
            type.displayName ||
            (inner && (inner.displayName || inner.name)) ||
            type.name ||
            null;
        }
        if (name && info.stack.length < 8) info.stack.unshift(name);
        // Only present in development builds before React 19.
        if (!info.source && fiber._debugSource && fiber._debugSource.fileName) {
          info.source = fiber._debugSource.fileName + ":" + (fiber._debugSource.lineNumber || 0);
        }
        fiber = fiber.return;
      }
      if (propsKey) info.props = summarizeProps(el[propsKey] || {});
      return info;
    }

    var vue = el.__vueParentComponent || el.__vue__;
    if (vue) {
      info.framework = "Vue";
      var node = vue;
      var vguard = 0;
      while (node && vguard++ < 40) {
        var vtype = node.type || (node.$options && node.$options);
        var vname = vtype && (vtype.name || vtype.__name);
        if (vname && info.stack.length < 8) info.stack.unshift(vname);
        node = node.parent || node.$parent;
      }
      var vprops = vue.props || (vue.$props ? vue.$props : null);
      if (vprops) info.props = summarizeProps(vprops);
      return info;
    }

    if (el.__ngContext__ !== undefined || (el.closest && el.closest("[ng-version]"))) {
      info.framework = "Angular";
      return info;
    }
    if (Object.keys(el).some(function (k) { return k.lastIndexOf("__svelte", 0) === 0; })) {
      info.framework = "Svelte";
    }
    return info;
  }

  function edges(style, prefix, suffix) {
    return ["top", "right", "bottom", "left"].map(function (side) {
      return Math.round(parseFloat(style.getPropertyValue(prefix + side + suffix)) || 0);
    });
  }

  function classesOf(el) {
    if (typeof el.className !== "string" || !el.className.trim()) return [];
    return el.className.trim().split(/\s+/).slice(0, 20);
  }

  /** Short label for where a rule came from. */
  function sheetOrigin(sheet) {
    if (!sheet || !sheet.href) return "<style>";
    try {
      var u = new URL(sheet.href);
      var parts = u.pathname.split("/");
      return parts[parts.length - 1] || u.host;
    } catch (e) {
      return "stylesheet";
    }
  }

  function collectRules(rules, el, origin, out) {
    for (var i = 0; i < rules.length && out.length < 60; i++) {
      var rule = rules[i];
      if (!rule) continue;
      // Style rule: keep it when the element matches.
      if (rule.selectorText) {
        var hit = false;
        try {
          hit = el.matches(rule.selectorText);
        } catch (e) {
          hit = false;
        }
        if (hit) {
          out.push({
            selector: String(rule.selectorText).slice(0, 240),
            text: String(rule.cssText || "").slice(0, 2000),
            origin: origin,
          });
        }
        continue;
      }
      // @media / @supports and friends: recurse one level into the group.
      if (rule.cssRules) {
        var condition = rule.conditionText || rule.media?.mediaText || "";
        try {
          collectRules(rule.cssRules, el, condition ? origin + " @ " + condition : origin, out);
        } catch (e) {}
      }
    }
  }

  /** CSS rules that actually apply to this element, in stylesheet order. */
  function matchedCss(el) {
    var out = [];
    var inline = el.getAttribute && el.getAttribute("style");
    if (inline) {
      out.push({
        selector: "element.style",
        text: "element.style { " + inline.slice(0, 1500) + " }",
        origin: "inline",
      });
    }
    var sheets = document.styleSheets || [];
    for (var s = 0; s < sheets.length && out.length < 60; s++) {
      var rules;
      try {
        // Cross-origin stylesheets throw here; nothing to show for those.
        rules = sheets[s].cssRules;
      } catch (e) {
        continue;
      }
      if (!rules) continue;
      collectRules(rules, el, sheetOrigin(sheets[s]), out);
    }
    return out;
  }

  function snapshot(el) {
    var style = getComputedStyle(el);
    var rect = el.getBoundingClientRect();

    var attrs = [];
    for (var i = 0; i < el.attributes.length && i < 30; i++) {
      var a = el.attributes[i];
      attrs.push([a.name, String(a.value).slice(0, 200)]);
    }

    var styles = STYLE_PROPS.map(function (prop) {
      return [prop, String(style.getPropertyValue(prop) || "").slice(0, 160)];
    }).filter(function (pair) {
      return pair[1] !== "";
    });

    var ancestors = [];
    var node = el.parentElement;
    while (node && ancestors.length < 12) {
      ancestors.unshift({ path: pathOf(node), label: describe(node) });
      node = node.parentElement;
    }

    var children = [];
    for (var c = 0; c < el.children.length && c < 40; c++) {
      children.push({ path: pathOf(el.children[c]), label: describe(el.children[c]) });
    }

    var text = "";
    try {
      text = (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 160);
    } catch (e) {}

    var html = "";
    try {
      html = String(el.outerHTML || "").slice(0, 12000);
    } catch (e) {}

    return {
      t: "pick",
      path: pathOf(el),
      selector: bestSelector(el),
      pageUrl: location.href,
      pageTitle: document.title || "",
      component: frameworkInfo(el),
      label: describe(el),
      tag: el.tagName ? el.tagName.toLowerCase() : "?",
      id: el.id || "",
      classes: classesOf(el),
      attrs: attrs,
      text: text,
      html: html,
      css: matchedCss(el),
      rect: {
        x: Math.round(rect.left),
        y: Math.round(rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      },
      box: {
        margin: edges(style, "margin-", ""),
        border: edges(style, "border-", "-width"),
        padding: edges(style, "padding-", ""),
      },
      styles: styles,
      ancestors: ancestors,
      children: children,
    };
  }

  function elementAt(e) {
    var el = document.elementFromPoint(e.clientX, e.clientY);
    return isOverlay(el) ? null : el;
  }

  function onMove(e) {
    if (!inspecting) return;
    var el = elementAt(e);
    if (el) drawHighlight(el);
  }

  function onPick(e) {
    if (!inspecting) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.type !== "click") return;
    var el = elementAt(e);
    if (!el) return;
    setInspecting(false);
    post(snapshot(el));
    post({ t: "inspect", active: false });
  }

  function onKey(e) {
    if (inspecting && e.key === "Escape") {
      e.preventDefault();
      setInspecting(false);
      post({ t: "inspect", active: false });
    }
  }

  function setInspecting(on) {
    inspecting = !!on;
    if (inspecting) {
      ensureOverlay();
      document.addEventListener("mousemove", onMove, true);
      document.addEventListener("click", onPick, true);
      document.addEventListener("mousedown", onPick, true);
      document.addEventListener("mouseup", onPick, true);
      document.addEventListener("keydown", onKey, true);
    } else {
      document.removeEventListener("mousemove", onMove, true);
      document.removeEventListener("click", onPick, true);
      document.removeEventListener("mousedown", onPick, true);
      document.removeEventListener("mouseup", onPick, true);
      document.removeEventListener("keydown", onKey, true);
      clearHighlight();
    }
  }

  // Entry point the host calls through `browser_eval`.
  window.__aetherInspect = function (on) {
    setInspecting(on);
    post({ t: "inspect", active: inspecting });
  };

  window.addEventListener(
    "scroll",
    function () {
      if (!inspecting) clearHighlight();
    },
    true,
  );

  // WebView2's own page menu (Back / Save as / Print / Inspect) belongs to a
  // browser, not to an editor pane, so it never gets to open.
  document.addEventListener(
    "contextmenu",
    function (e) {
      e.preventDefault();
    },
    true,
  );

  // -- keep navigation inside the pane ---------------------------------
  // A pane has no tab strip of its own, so popups and `target="_blank"`
  // links would otherwise vanish into a window nothing ever shows.
  window.open = function (url) {
    if (url) {
      try {
        location.href = absolute(url);
      } catch (e) {}
    }
    return null;
  };

  document.addEventListener(
    "click",
    function (e) {
      var node = e.target;
      var anchor = node && node.closest ? node.closest("a[target]") : null;
      if (anchor && (anchor.target === "_blank" || anchor.target === "_new")) {
        anchor.removeAttribute("target");
      }
    },
    true,
  );

  window.addEventListener("pagehide", function () {
    if (timer !== null) {
      clearTimeout(timer);
      send();
    }
  });

  post({ t: "newdoc", url: location.href });
})();
