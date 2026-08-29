// Jottem-widgetlader (hoofdstuk Deelbaarheid, D-2): haalt een widget-route op en
// plaatst de inhoud direct in de pagina, zodat de widget het lettertype en de
// kleuren van de site zelf erft. Gebruik:
//   <div id="jottem-widget"></div>
//   <script async src="https://.../widget.js"
//           data-doel="#jottem-widget"
//           data-src="https://.../widget/ORGANISATIE/PROJECT/recent/3"></script>
(function () {
  var script = document.currentScript;
  if (!script) return;
  var src = script.getAttribute("data-src");
  var doel = document.querySelector(script.getAttribute("data-doel") || "#jottem-widget");
  if (!src || !doel) {
    console.warn("jottem-widget: data-src of doel-element ontbreekt");
    return;
  }
  fetch(src)
    .then(function (antwoord) {
      if (!antwoord.ok) throw new Error("status " + antwoord.status);
      return antwoord.text();
    })
    .then(function (html) {
      var doc = new DOMParser().parseFromString(html, "text/html");
      var widget = doc.querySelector(".jottem-widget");
      if (!widget) throw new Error("geen widget in het antwoord");
      doel.replaceChildren(widget);
    })
    .catch(function (fout) {
      console.warn("jottem-widget: laden mislukt (" + fout.message + ")");
    });
})();
