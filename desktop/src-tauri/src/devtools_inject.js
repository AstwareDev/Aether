// Carries the injected stylesheet into DevTools' shadow roots.
//
// Custom properties inherit through shadow boundaries, so the palette reaches
// the whole UI from the document alone. Ordinary rules do not - and hiding a
// toolbar button is an ordinary rule. This adopts the same sheet into every
// shadow root as it is created, and keeps it there.
//
// Served from Aether's own origin because the front-end's CSP allows scripts
// from `self` but not inline ones.
(function () {
  var source = document.getElementById("aether-devtools-theme");
  if (!source || typeof CSSStyleSheet !== "function" || typeof ShadowRoot !== "function") return;

  var sheet;
  try {
    sheet = new CSSStyleSheet();
    sheet.replaceSync(source.textContent);
  } catch (e) {
    return;
  }

  function adopt(root) {
    try {
      var current = root.adoptedStyleSheets || [];
      if (Array.prototype.indexOf.call(current, sheet) === -1) {
        root.adoptedStyleSheets = Array.prototype.slice.call(current).concat(sheet);
      }
    } catch (e) {
      /* a root that will not take it is not worth failing over */
    }
  }

  // DevTools assigns a root's sheets wholesale, which would drop ours. Appending
  // in the setter keeps it last, and last wins.
  var descriptor = Object.getOwnPropertyDescriptor(ShadowRoot.prototype, "adoptedStyleSheets");
  if (descriptor && descriptor.set && descriptor.get) {
    Object.defineProperty(ShadowRoot.prototype, "adoptedStyleSheets", {
      configurable: true,
      get: function () {
        return descriptor.get.call(this);
      },
      set: function (sheets) {
        var next = Array.prototype.slice.call(sheets);
        if (next.indexOf(sheet) === -1) next.push(sheet);
        descriptor.set.call(this, next);
      },
    });
  }

  var attachShadow = Element.prototype.attachShadow;
  Element.prototype.attachShadow = function (init) {
    var root = attachShadow.call(this, init);
    adopt(root);
    return root;
  };
})();
