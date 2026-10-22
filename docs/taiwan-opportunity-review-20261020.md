# Taiwan opportunity review — 2026-10-20 UTC

## Scope and storage

17 new reviewed records, plus the existing Taiwan Creative Expo watch item. The default active view contains 16 records (including unconfirmed notices); two historical music calls are closed. This is a researched snapshot, not a claim of exhaustive coverage or an automatic social-media feed.

Records live in `lib/grants/catalogue/taiwan-20261020.json`, validated through `reviewed-catalogue.ts` and imported into existing `grant_opportunity` rows via stable `(source, externalId)` upserts. No schema migration, new dependency, paid API, applicant action or GitHub push. The existing daily grant adapters do not discover new items from this manual catalogue.

The development target was verified as `127.0.0.1:54322/taloox_merged_20261019`. Database catalogue count rose from 33 to 50. All preexisting IDs stayed stable. Hash comparisons confirmed the five applications, eight task links and watch records were unchanged.

## Review decisions

- Keep application windows separate from performance/exhibition dates and fiscal years.
- SKM competition closes October 31; the separate analog exhibition closes November 20.
- Kaohsiung Award press release conflicts on opening day. Use October 1 from its current official rules: https://awardkmfa.org.tw/dl/rules-2027.pdf
- Illustration Taipei advertises a 2027 event but states a February 2026 deadline in its October 2026 announcement. Preserve an unknown final deadline, not an inferred correction. November 6 is only its early-bird date.
- MADZINE public Patreon has a forthcoming form and inconsistent February 26/27 Kaohsiung performance dates. Preserve the published application dates but mark source status unknown.
- ART FUTURE states a deadline but no opening date; availability remains check. It is a paid gallery fair with section-specific conditions, not a universally free individual opportunity.
- GJ IF8 is a future first call, not currently open. Do not import a conditional second call as guaranteed.
- StreetVoice Next Big Thing and King Car weekend concerts are closed cycles. Future performances do not reopen them.
- Date columns have day precision. Exact published times are retained in the summary and bilingual eligibility notes; the existing day-level badge does not enforce intraday cutoffs. NTSO opens at 09:00 Taiwan time, not midnight.
- Complex age, residency, student, rights and institution requirements remain explicit notes requiring review. A Taiwan host does not establish applicant nationality. Do not label every creator eligible.

## Social coverage and limits

- Read the organizer's public Patreon announcement in full: https://www.patreon.com/madzinetw/posts/hataken-x-x-2026-171658751
- Queried Facebook, Instagram and Threads public-index searches; no usable indexed results for those queries. This is not evidence that no opportunities exist there.
- Direct StreetVoice Facebook and Matsu Instagram fetches failed.
- Followed TFAM's official social links: https://www.instagram.com/tfam_museum/ and https://www.facebook.com/taipeifineartsmuseum?ddlLang=zh-tw . Both could not be fetched.
- Followed the MWD official Facebook link https://mwd.tw/MWD05 ; it redirected to a login page for https://www.facebook.com/Movie.MWD/ . Verified the competition instead against MWD's own published rules.
- No private groups, login-only content, social posting, account authorization, form submission or anti-bot bypass was used.

## Additional candidates reviewed but not imported

- https://www.kingcarart.org.tw/projects-detail/197 — June 2026 deadline already passed.
- https://www.tfam.museum/News/News_page.aspx?ddlLang=zh-tw&id=2062 — April 2026 deadline already passed.
- https://www.tcam.museum/zh/exhibition/opencallfor2027 — January 2026 deadline already passed.
- https://www.taipeiillustrationfair.com/application — August 31 deadline already passed; different event from Illustration Taipei.
- https://www.findingtaiwan2026.com.tw/ — August 31 deadline already passed.
- https://streetvoice.com/opportunities/1092/ — original-music registration closed; later showcase dates are not application windows.
- https://official-website.meridianproject.tw/audition — talent-agency audition, outside the current competition/exhibition categories.
- https://art.nttu.edu.tw/p/405-1026-129432%2Cc8505.php?Lang=zh-tw — secondary STAART repost; current application deadline not verified against organizer.
- https://opencall.searchbefore.tw/topics/art-open-calls — discovery aid only. Imported facts were checked against primary sources, not copied wholesale.

## Verification

- Existing grant unit tests: 25 passed.
- ESLint for changed TypeScript module: passed.
- Catalogue schema, unique IDs, valid date order, text encoding, two closed cycles, two future cycles as of October 20 Taiwan date, and conflicting-date handling: passed.
- Browser readback: Taiwan competition/exhibition default view shows 16 records. Opened X-site detail and checked official link, application planning controls and source summary. Did not create applications or calendar tasks.

## Imported source index

- `tfam-x-site-2027` (exhibition): https://www.tfam.museum/News/News_page.aspx?ddlLang=zh-tw&id=2111
- `skm-photo-contest-2027` (competition): https://culture.skm.com.tw/ActEvent/Cweb/ActiveContent?ActUUID=807a24b9-5380-41f0-96e2-b98636e0267e&MenuUUID=68381c6f-c841-46b9-bb39-0f0e9ff98722
- `skm-analog-2027` (exhibition): https://culture.skm.com.tw/ActEvent/Cweb/ManualDownload?ActUUID=81cf9245-ae45-4bd8-90b3-1ea90a40def7&MenuUUID=23a22f8c-b1ad-426d-8e75-33d69624bed3
- `kaohsiung-award-2027` (competition): https://awardkmfa.org.tw/
- `matsu-biennial-2027` (exhibition): https://matsubiennial.tw/news/details/87
- `keelung-ciao-2027` (exhibition): https://klctb.klcg.gov.tw/News_Content.aspx?n=7488&s=18784&sms=12483
- `cycc-graduation-2027` (exhibition): https://cycc.org.tw/zh-hant/node/246
- `ntso-composition-2027` (competition): https://event.culture.tw/mocweb/reg/NTSO/Detail.init.ctr?actId=60094
- `art-future-2027` (exhibition): https://www.art-formosa.com/?action=application
- `illustration-taipei-2027` (exhibition): https://illustrationtaipei.com/taipei/news/bd1ed9e5-2f6c-448c-85c2-6f26af671479
- `if8-circle-2027` (exhibition): https://if.gjs.tw/circle.html
- `madzine-modular-tour-call-2026` (showcase): https://www.patreon.com/madzinetw/posts/hataken-x-x-2026-171658751
- `mwd-film-2026` (competition): https://www.mwd.com.tw/index.php?article_id=6601&code=list&flag=detail&ids=18
- `youth-film-university-2026` (competition): https://micromovie.org.tw/2026youth-films-festival/
- `tccs-short-film-2026` (competition): https://www.tccs.org.tw/contest/
- `streetvoice-next-big-thing-2026` (showcase): https://streetvoice.com/opportunities/1081/
- `kingcar-weekend-music-2027` (showcase): https://www.kingcarart.org.tw/projects-detail/208
