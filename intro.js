/* PHOENIX · Animación de entrada (archivo independiente).
   Se carga en el <head>. Solo corre en la pantalla de inicio. */
(function () {
  // ----- Ajustes -----
  var ONCE_PER_SESSION = false;  // true = solo la primera vez que entra (en esa pestaña)
  var END_MS  = 10300;           // cuándo termina la intro (asientos 0.2–10.4 s, nombre 3–6.6 s, logo 6.9–10.1 s)
  var FADE_MS = 900;             // duración del desvanecido final

  var html = document.documentElement;
  var view = (location.hash || '').replace('#/', '');
  var isHome = ['nuevo', 'consultar', 'login', 'panel', 'pedidos'].indexOf(view) === -1;
  var seen = false;
  try { seen = ONCE_PER_SESSION && sessionStorage.getItem('phoenixIntro') === '1'; } catch (e) {}
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (!isHome || seen || reduce) return;      // no hay intro: la página sale normal
  html.classList.add('intro-on');

  document.addEventListener('DOMContentLoaded', function () {
    var el = document.getElementById('intro');
    if (!el) { html.classList.remove('intro-on'); return; }

    var done = false, timer = setTimeout(finish, END_MS);

    function finish() {
      if (done) return;
      done = true;
      clearTimeout(timer);
      el.classList.add('intro-out');          // desvanece la intro...
      html.classList.remove('intro-on');      // ...y la página aparece con sus animaciones
      try { sessionStorage.setItem('phoenixIntro', '1'); } catch (e) {}
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, FADE_MS + 150);
    }

    var skip = el.querySelector('.intro-skip');
    if (skip) skip.addEventListener('click', finish);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' || e.key === 'Enter') finish();
    });
  });
})();
