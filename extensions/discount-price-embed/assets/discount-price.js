(function () {
  var D = window.DiscountDisplay;
  if (!D || !D.settings || !D.settings.enabled) return;
  var S = D.settings;
  var P = D.prices || {};

  var shopify = window.Shopify || {};
  var currency = (shopify.currency && shopify.currency.active) || "USD";
  var rate = (shopify.currency && parseFloat(shopify.currency.rate)) || 1;
  var fmt;
  try {
    fmt = new Intl.NumberFormat(document.documentElement.lang || undefined, {
      style: "currency",
      currency: currency,
    });
  } catch (e) {
    fmt = {
      format: function (n) {
        return n.toFixed(2);
      },
    };
  }
  function money(n) {
    return fmt.format(n * rate);
  }

  var color = /^#[0-9a-fA-F]{3,8}$/.test(S.saleColor) ? S.saleColor : "#d82c0d";

  function selectorList(selectors, legacySelector) {
    var list = Array.isArray(selectors) ? selectors : [legacySelector];
    return list
      .filter(function (selector) {
        return typeof selector === "string" && selector.trim();
      })
      .join(", ");
  }

  function needsApply(el, key) {
    var wrap = el.querySelector(".dd-wrap");
    if (!wrap || wrap.getAttribute("data-key") !== key) return true;
    // Theme often re-injects the regular price as a sibling text node after our wrap.
    var clone = el.cloneNode(true);
    var w = clone.querySelector(".dd-wrap");
    if (w) w.remove();
    return !!(clone.textContent || "").replace(/\s+/g, "").length;
  }

  function apply(el, o, s) {
    if (s >= o) {
      if (el.querySelector(".dd-wrap")) el.textContent = money(o);
      return;
    }

    var key = o + "|" + s;
    if (!needsApply(el, key)) return;
    el.innerHTML =
      '<span class="dd-wrap" data-key="' +
      key +
      '">' +
      '<s class="dd-orig">' +
      money(o) +
      "</s>" +
      '<span class="dd-sale">' +
      money(s) +
      "</span></span>";
    el.querySelector(".dd-sale").style.color = color;
  }

  function handleFromUrl(url) {
    var m = (url || "").match(/\/products\/([^/?#]+)/);
    return m ? decodeURIComponent(m[1]) : null;
  }

  function variantIdFromUrl(url) {
    try {
      return new URL(url, location.origin).searchParams.get("variant");
    } catch (e) {
      return null;
    }
  }

  function normalizedVariantId(id) {
    return id ? String(id).split("/").pop() : null;
  }

  function priceFor(entry, vid) {
    var id = normalizedVariantId(vid);
    return id && entry.variants ? entry.variants[id] || null : null;
  }

  function cardLinkFor(el) {
    var box = el.closest(
      "li, article, .card-wrapper, .product-card, .grid__item, .product-item",
    );
    return box && box.querySelector('a[href*="/products/"]');
  }

  function productFormFor(entry) {
    var forms = document.querySelectorAll('form[action*="/cart/add"]');
    var candidates = [];
    forms.forEach(function (form) {
      if (
        form.closest(
          "li, article, .card-wrapper, .product-card, .grid__item, .product-item",
        )
      ) {
        return;
      }
      var scope = form.closest("section") || form.closest(".product");
      if (!scope) return;
      var idInput = form.querySelector('[name="id"]');
      candidates.push({
        form: form,
        scope: scope,
        variantId: idInput ? idInput.value : null,
      });
    });
    return (
      candidates.find(function (candidate) {
        return priceFor(entry, candidate.variantId);
      }) ||
      candidates[0] ||
      null
    );
  }

  function run() {
    // Main product page
    var pageHandle = handleFromUrl(location.pathname);
    if (pageHandle && P[pageHandle]) {
      var entry = P[pageHandle];
      var productForm = productFormFor(entry);
      if (S.showOnProductPage && productForm) {
        var form = productForm.form;
        var idInput = form.querySelector('[name="id"]');
        var vid = (idInput && idInput.value) || variantIdFromUrl(location.href);
        var prices = priceFor(entry, vid);
        var productSelector = selectorList(
          S.productSelectors,
          S.productSelector || ".price",
        );
        if (productSelector && prices) {
          productForm.scope
            .querySelectorAll(productSelector)
            .forEach(function (el) {
              if (!cardLinkFor(el)) apply(el, prices.o, prices.s);
            });
        }
      }
    }

    // Product cards
    if (S.showOnCards) {
      var cardSelector = selectorList(
        S.cardSelectors,
        S.cardSelector || ".price",
      );
      if (!cardSelector) return;
      document.querySelectorAll(cardSelector).forEach(function (el) {
        var a = cardLinkFor(el);
        if (!a) return;
        var h = handleFromUrl(a.getAttribute("href"));
        if (!h || !P[h]) return;

        var variantId = variantIdFromUrl(a.href);
        var cardPrices = variantId
          ? priceFor(P[h], variantId)
          : P[h].card || null;
        if (cardPrices) apply(el, cardPrices.o, cardPrices.s);
      });
    }
  }

  var timers = [];
  function later() {
    timers.forEach(clearTimeout);
    timers = [];
    // Theme JS often rewrites price after our first pass — retry a few times.
    [50, 150, 350, 700].forEach(function (ms) {
      timers.push(setTimeout(run, ms));
    });
  }

  run();
  new MutationObserver(function () {
    later();
  }).observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
  });

  document.addEventListener("change", later, true);
  document.addEventListener("click", later, true);
  document.addEventListener("shopify:section:load", later);
})();
