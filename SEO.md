# Search visibility for DesignByYou

## What changed

- Public HTML homepage at `https://dby.studio/`, with useful product copy available without JavaScript or login.
- Descriptive title, meta description, canonical URL, social sharing metadata, favicon and WebSite structured data.
- `robots.txt` declares the sitemap. `sitemap.xml` includes only the public homepage; authenticated pages are not sitemap entries.
- Account/application HTML carries `noindex, follow`. This is an indexing instruction, not an access-control mechanism; backend authentication remains required.
- Build preserves the React shell as `dist/app.html` and writes the public homepage to `dist/index.html`. `serve.json` routes application deep links to `app.html`. Local Vite development also serves the public homepage at `/`.

## Deployment requirements

Use `npm run build` and `npm start` for the frontend service. Do not override the build with plain `vite build`: the public-entry preparation is necessary. Remove any old Railway start override using `serve --single`: it would send application links to the homepage instead of the React shell. The committed start command reads `serve.json`.

After deployment, check anonymously:

1. `/` shows the homepage and its HTML contains the canonical URL, title, description and readable product content. There must be no `noindex` tag or X-Robots-Tag on this page.
2. `/login`, `/register`, `/creator/projects` and booking links load the application with existing authentication rules.
3. `/robots.txt` returns plain text and `/sitemap.xml` returns the XML sitemap, not an HTML fallback.
4. Confirm `https://dby.studio/` is the preferred domain. Configure other owned hostname/protocol variants to redirect to it at the host/DNS provider. Canonical tags alone do not implement redirects.
5. If staging uses this build, block indexing of that staging hostname at its host. This homepage is intended for the production domain.

## Google Search Console

1. Open https://search.google.com/search-console and add the Domain property `dby.studio`.
2. Copy Google's exact DNS TXT verification value into the domain's DNS settings, then verify. Do not invent a verification token or delete unrelated DNS records.
3. Submit `https://dby.studio/sitemap.xml` in Sitemaps.
4. Inspect `https://dby.studio/`, run Test Live URL, check the rendered page, and request indexing after successful deployment.
5. Review Page indexing for crawl errors, redirects, exclusions and Google's selected canonical. Record the actual exclusion reason before making further changes.

Search Console ownership and indexing status were not available in this session. No DNS changes or indexing request have been made. Indexing/rankings are not guaranteed and a crawl can take days or weeks.

## Further content

Add useful public pages about the Fashion Editor, creative tools and designer collaboration when there is enough distinct content for each. Do not expose private projects or make authenticated showcase APIs public merely for SEO. Public design pages need explicit publication controls and safe metadata first. Avoid fabricated ratings, keyword stuffing and empty landing pages.

References: https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics and https://developers.google.com/search/docs/crawling-indexing/ask-google-to-recrawl
