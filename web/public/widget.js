// Jottem-widgetlader (hoofdstuk Deelbaarheid, D-2 en D-9): haalt een widget-route op en
// plaatst de inhoud direct in de pagina, zodat de widget het lettertype en de kleuren van
// de site zelf erft. Gebruik:
//   <div id="jottem-widget"></div>
//   <script async src="https://.../widget.js"
//           data-doel="#jottem-widget"
//           data-src="https://.../widget/ORGANISATIE/PROJECT/recent/3"></script>
//
// Dit script draait op het origin van de partnersite. Het vertrouwt daarom niets wat het
// ophaalt (D-9): data-src moet van hetzelfde origin komen als dit script, en de HTML wordt
// vóór het invoegen opgeschoond. Een <script> uit DOMParser draait niet, maar een
// attribuut als onerror wél zodra het element in de pagina staat; vandaar de allowlist.
(function () {
  var script = document.currentScript;
  if (!script) return;
  var src = script.getAttribute("data-src");
  var doel = document.querySelector(script.getAttribute("data-doel") || "#jottem-widget");
  if (!src || !doel) {
    console.warn("jottem-widget: data-src of doel-element ontbreekt");
    return;
  }

  var eigen;
  var bron;
  try {
    eigen = new URL(script.src).origin;
    bron = new URL(src, script.src);
  } catch (e) {
    console.warn("jottem-widget: ongeldige data-src");
    return;
  }
  if (bron.origin !== eigen) {
    console.warn("jottem-widget: data-src hoort bij " + eigen);
    return;
  }

  // precies wat de widgetroutes uitleveren (web/app/widget/html.ts), en niets meer
  var ELEMENTEN = ["DIV", "P", "A", "IMG", "STRONG", "SMALL", "SPAN", "BR",
                   "SVG", "G", "PATH"];
  var ATTRIBUTEN = ["class", "style", "href", "src", "alt", "title", "target", "rel",
                    "width", "height", "loading", "viewbox", "transform", "fill",
                    "fill-rule", "d", "aria-hidden"];

  function veiligeUrl(waarde) {
    try {
      var u = new URL(waarde, bron);
      return u.protocol === "https:" || u.protocol === "http:";
    } catch (e) {
      return false;
    }
  }

  function schoonAttributen(element) {
    var namen = Array.prototype.map.call(element.attributes, function (a) { return a.name; });
    for (var j = 0; j < namen.length; j++) {
      var naam = namen[j].toLowerCase();
      var waarde = element.getAttribute(namen[j]) || "";
      if (ATTRIBUTEN.indexOf(naam) === -1
          || ((naam === "href" || naam === "src") && !veiligeUrl(waarde))) {
        element.removeAttribute(namen[j]);
      }
    }
  }

  function schoon(element) {
    schoonAttributen(element);
    var kinderen = Array.prototype.slice.call(element.children);
    for (var i = 0; i < kinderen.length; i++) {
      if (ELEMENTEN.indexOf(kinderen[i].tagName.toUpperCase()) === -1) {
        kinderen[i].remove();
      } else {
        schoon(kinderen[i]);
      }
    }
    return element;
  }

  fetch(bron.href)
    .then(function (antwoord) {
      if (!antwoord.ok) throw new Error("status " + antwoord.status);
      return antwoord.text();
    })
    .then(function (html) {
      var doc = new DOMParser().parseFromString(html, "text/html");
      var widget = doc.querySelector(".jottem-widget");
      if (!widget) throw new Error("geen widget in het antwoord");
      doel.replaceChildren(schoon(widget));
    })
    .catch(function (fout) {
      console.warn("jottem-widget: laden mislukt (" + fout.message + ")");
    });
})();
