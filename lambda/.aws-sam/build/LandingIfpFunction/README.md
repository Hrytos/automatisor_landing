# Automatisor Landing Page

Marketing site for Automatisor — warehouse intelligence for automation providers. Built with Express and server-rendered EJS templates.

## Pages

| Route    | Template          | Description                                                        |
| -------- | ----------------- | -------------------------------------------------------------------- |
| `/`      | `views/index.ejs` | Customer Success persona homepage                                    |
| `/sales` | `views/sales.ejs` | Customer Acquisition persona page                                    |
| `/demo`  | `views/demo.ejs`  | Booking page with an embedded Cal.com scheduler                      |

## Getting started

```bash
npm install
npm start
```

The site runs at `http://localhost:3000` (or `$PORT` if set).

## Project structure

```
server.js                 Express app and routes
views/
  index.ejs, sales.ejs, demo.ejs   Page templates
  partials/
    header.ejs             Site header, incl. mobile menu
    footer.ejs              Site footer
    warehouse-research.ejs  Sample pre-assessment table section
    signal-section.ejs      "Built for Warehousing" source-map + stats
    engine-section.ejs      CTA section with animated chart
    analytics.ejs           Microsoft Clarity tracking snippet
public/
  css/styles.css           Single stylesheet for the whole site
  js/
    main.js                Nav dropdowns, mobile menu, expandable table rows
    chat-demo.js            Animated chat demo component
    source-map.js            Circuit-trace diagram + connector animation
  images/, herobgvideo.mp4  Static assets
```

Shared sections (header, footer, warehouse research table, signal section, engine section) are EJS partials included by each page, so page-specific copy is passed in as locals rather than duplicated.

## Notes

- No build step — styles and scripts are served as static files.
- Only dependencies are `express` and `ejs`; keep it that way unless a feature genuinely needs more.
- The Cal.com embed on `/demo` and the Microsoft Clarity snippet in `partials/analytics.ejs` are third-party scripts included verbatim.
