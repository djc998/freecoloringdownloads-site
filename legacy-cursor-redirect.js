/*
 * Legacy cursor URLs -> static screens.
 *
 * The live (server) site paged listings with a cursor query:
 *   /c/<category>?after=<createdAtMs>_<bookId>
 *   /new?after=<createdAtMs>_<bookId>
 * The cursor names the last book of the screen the visitor was on, so the
 * screen it pointed to is: every book strictly after that book in
 * newest-first order (createdAt desc, then id desc), in chunks of PAGE_SIZE
 * (24 — src/lib/site.ts; if PAGE_SIZE changes, change it here too and rebuild).
 *
 * A static host can't do that mapping server-side, so this script — loaded in
 * <head> on every page — does it in the browser: it downloads the same public
 * catalog index the site is built from, finds which screen the cursor's
 * *successors* start on, and replaces the URL with /c/<id>/page/<N> (or
 * /new/page/<N>) without a reload of anything else. It deliberately does NOT
 * try to reproduce the exact cursor screen contents (any duplicate ids or
 * equal timestamps could shift a book by one slot); it lands the visitor on
 * the screen where the books they were about to see begin.
 *
 * It is also copied into out/404.html's flow by GitHub Pages: Pages serves
 * 404.html for unknown paths, and this script is referenced from the layout,
 * so a legacy URL with a bogus static path still redirects.
 */
(function () {
  var PAGE_SIZE = 24;
  var INDEX_URL =
    "https://firebasestorage.googleapis.com/v0/b/icolor-pages.firebasestorage.app/o/catalog%2Findex.json?alt=media";

  var match = window.location.pathname.match(/^\/(c\/[a-z0-9-]+|new)\/?$/);
  if (!match) return;
  var after = new URLSearchParams(window.location.search).get("after");
  if (!after) return;

  var sep = after.indexOf("_");
  if (sep === -1) return;
  var ms = Number(after.slice(0, sep));
  var cursorId = after.slice(sep + 1);
  if (!Number.isFinite(ms) || !cursorId) return;

  var base = "/" + match[1];
  var categoryId = match[1].indexOf("c/") === 0 ? match[1].slice(2) : null;

  function tsMs(ts) {
    return ts ? (ts.seconds || 0) * 1000 + Math.floor((ts.nanoseconds || 0) / 1e6) : 0;
  }

  fetch(INDEX_URL)
    .then(function (res) {
      if (!res.ok) throw new Error("index " + res.status);
      return res.json();
    })
    .then(function (index) {
      var books = (index.books || [])
        .map(function (b) {
          return { id: b.id, createdAt: tsMs(b.createdAt), categories: b.categories || [] };
        })
        .sort(function (a, b) {
          return b.createdAt - a.createdAt || (a.id < b.id ? 1 : -1);
        });
      if (categoryId) {
        books = books.filter(function (b) {
          return b.categories.indexOf(categoryId) !== -1;
        });
      }
      // First book strictly after the cursor — same rule as the old server pager.
      var start = books.findIndex(function (b) {
        return b.createdAt < ms || (b.createdAt === ms && b.id < cursorId);
      });
      if (start === -1) start = books.length;
      var screen = Math.floor(start / PAGE_SIZE) + 1;
      var target = screen <= 1 ? base : base + "/page/" + screen;
      window.location.replace(target);
    })
    .catch(function () {
      // Index unreachable: leave the visitor on the first screen rather than
      // stranding them on a URL the static host renders as screen 1 anyway.
    });
})();
