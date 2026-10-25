(function () {
  var D = window.DiscountDisplay;
  if (!D || !D.settings || !D.settings.enabled) return;
  var S = D.settings;
  var P = D.prices || {};

  var currency =
    (window.Shopify && Shopify.currency && Shopify.currency.active) || "USD";
  var rate =
    (window.Shopify && Shopify.currency && parseFloat(Shopify.currency.rate)) || 1;
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
    var m = (url || "").match(/\/products\/([^\/?#]+)/);
    return m ? decodeURIComponent(m[1]) : null;
  }

  function priceFor(entry, vid) {
    if (vid && entry.variants && entry.variants[vid]) return entry.variants[vid];
    return { o: entry.o, s: entry.s };
  }

  function run() {
    var mainSection = null;

    // Main product page
    var form = document.querySelector('form[action*="/cart/add"]');
    var pageHandle = handleFromUrl(location.pathname);
    if (form && pageHandle) {
      mainSection = form.closest("section") || form.closest("main");
      if (S.showOnProductPage && P[pageHandle] && mainSection) {
        var idInput = form.querySelector('[name="id"]');
        var vid = idInput ? idInput.value : null;
        var entry = P[pageHandle];
        var prices = priceFor(entry, vid);
        var el = mainSection.querySelector(S.productSelector || ".price");
        if (el && prices && prices.s < prices.o) apply(el, prices.o, prices.s);
      }
    }

    // Product cards
    if (S.showOnCards) {
      document.querySelectorAll(S.cardSelector || ".price").forEach(function (el) {
        if (mainSection && mainSection.contains(el)) return;
        var box = el.closest(
          "li, article, .card-wrapper, .product-card, .grid__item, .product-item",
        );
        var a = box && box.querySelector('a[href*="/products/"]');
        if (!a) return;
        var h = handleFromUrl(a.getAttribute("href"));
        if (h && P[h]) apply(el, P[h].o, P[h].s);
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
  }).observe(document.body, { childList: true, subtree: true, characterData: true });

  document.addEventListener("change", later, true);
  document.addEventListener("click", later, true);
  document.addEventListener("shopify:section:load", later);
})();
