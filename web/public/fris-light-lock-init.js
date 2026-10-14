(function () {
  try {
    var p = location.pathname;
    var slash = '/';
    var fris = slash + 'fris';
    var dashboard = fris + slash + 'dashboard';
    var others = slash + 'others';
    var login = slash + 'login';
    var lock =
      (p.indexOf(fris) === 0 && p.indexOf(dashboard) !== 0) ||
      p.indexOf(others) === 0 ||
      p === login;
    if (lock) {
      var root = document.documentElement;
      root.setAttribute('data-fris-light-lock', '');
      root.classList.remove('dark');
      root.style.colorScheme = 'light';
    }
  } catch (e) {
    // ignore
  }
})();
