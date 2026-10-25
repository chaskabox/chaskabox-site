# Shop Hero first-paint fix

The first Shop visit from another SPA route previously painted the catalogue before the dynamically imported hero mounted. The two reference phrase fonts also required separate downloads and could briefly show fallback lettering. Legacy `/#/shop` bookmarks waited for catalogue initialization before leaving the old homepage.

First entry to Shop now uses the complete server-rendered document when that document has not already mounted a hero. Once mounted, Shop filters and return visits inside the same document keep SPA behavior. Legacy Shop bookmarks redirect in the document head before painting the old homepage; authentication/recovery hashes are unaffected.

The Shop response includes its critical stylesheet, the two small reference fonts, and matching low-resolution artwork previews. Desktop and mobile receive the same approved composition immediately while full-resolution images finish. Custom artwork does not receive the reference preview. The full images keep their responsive priority, and JavaScript only adds controls and timing. The default design, three-second interval and Admin editor remain unchanged.

`node tools/build-shop-hero.mjs` generates the critical CSS module and client runtime. `npm run check` verifies both generated outputs. The server-only embedded CSS is tree-shaken out of the client bundle.

Tests cover first-entry navigation, already-mounted/disabled-hero filter navigation, legacy bookmarks, recovery-hash preservation and self-contained critical assets. Browser acceptance explicitly aborts the hero runtime, stylesheet, fonts and full artwork on fresh mobile/desktop visits, then checks visible layout, reference fonts, matching embedded previews and absence of the old homepage.
