# Planetary Orbit Simulator — HTML5 (accessible, KL-UNL)

An accessible HTML5 port of the NAAP *Planetary Orbit Simulator*, built on the shared
KL-UNL foundation.

## It must be served over HTTP — double-clicking `index.html` will NOT work

The KL-UNL masthead (`foundation/kl-unl-masthead.js`) loads its title / Help / About text
with `fetch('foundation/contents.json')`. Browsers block `fetch()` of local files under the
`file://` protocol (same-origin policy), so opening `index.html` directly shows an empty or
broken masthead (and MathJax also fails to load). Serve the folder over HTTP and it works.

## Run it locally

From **inside this `html5/` folder**, start any static server:

```
# Python 3
python3 -m http.server 8123
# then open http://localhost:8123/

# Node
npx serve
# or
npx http-server
```

- **VS Code:** the *Live Server* extension (right-click `index.html` → “Open with Live Server”).

Because you serve from inside `html5/`, the sim is at the server root — open
`http://localhost:8123/`, **not** `.../html5/index.html`.

## Production

When deployed to the cloud host (served over HTTP/HTTPS) it just works. The `file://`
limitation only affects local double-clicking.

## Layout

```
html5/
  index.html            KL-UNL scaffold + panels
  foundation/           copied UNCHANGED (kl-unl-masthead.js, kl-unl.css, kl-unl.js,
                        contents.json with this sim's entry added)
  styles/styles.css     sim-specific styles only
  simulation.js         all sim logic (physics ported from the AS source)
  assets/               mathjax/ (vendored, local) + click.mp3 (sweep sound)
  README.md, CONVERSION_NOTES.md, ACCESSIBILITY.md
```

No build step, no bundler, no framework, no CDN. All assets are local; the only runtime
fetches are `foundation/contents.json` and the vendored MathJax — nothing leaves the host.
