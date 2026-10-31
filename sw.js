/* Файл: sw.js */
// P2-0066: номер версии и список файлов не правятся руками — их пишет сборка (npm run build:version) в участок ниже.
// <app-version> — сгенерировано scripts/app-version.mjs (npm run build:version), руками не править
const APP_RELEASE = {
  version: '2026.10.31-7186a17d',
  date: '2026-10-31',
  digest: '7186a17d',
  modules: {"planfact":"p2","company":"p2","platform-admin":"p2","construction-v2":"rbi","construction":"rbi","quality":"rbi"},
  prefixes: [["js/dist/planfact/","planfact"],["js/dist/company/","company"],["js/dist/platform-admin/","platform-admin"],["js/modules/construction-v2/","construction-v2"],["js/modules/construction/","construction"],["js/modules/quality/","quality"],["js/dist/construction-v2.js","construction-v2"],["js/dist/rbi-construction-","construction"]],
  files: {
    "css/analytics.desktop.css": ["909efb47e2bdb9fa",118397,""],
    "css/app-shell.desktop.css": ["ede63172f4e50381",13109,""],
    "css/audit.desktop.css": ["1c94cbcc861ff89d",22407,""],
    "css/brand/rbi.css": ["d6fc89acf92746e5",2794,""],
    "css/engineer.desktop.css": ["b29889670a009d05",55905,""],
    "css/knowledge.desktop.css": ["18ad35ee263ffca2",130381,""],
    "css/rbi-ui.css": ["9290cab5b13fea70",12437,""],
    "css/settings.desktop.css": ["1b551fe3acba9f3d",8821,""],
    "css/style.css": ["3e83d801bb961bc2",147893,""],
    "data/system_docs.js": ["c40df82592807620",246,""],
    "data/system_nodes.js": ["77addf141ffa0287",255,""],
    "data/system_templates.en.js": ["72ca316ccf0ed83c",225751,""],
    "data/system_templates.js": ["d0f758d7dd9355e0",448772,""],
    "data/system_templates.ka.js": ["2e51fa6ff4ccbba9",482640,""],
    "data/system_templates.sr-Latn.js": ["45bd7d3d50beea8d",229209,""],
    "data/system_twi.js": ["bf66e35792b264f0",263,""],
    "favicon.ico": ["23d9123d8ffcdf06",9305,""],
    "fonts/BricolageGrotesque-Bold.woff2": ["4b0dca16374079e9",38944,""],
    "fonts/BricolageGrotesque-ExtraBold.woff2": ["62f797bb6dfb0098",38196,""],
    "fonts/BricolageGrotesque-Light.woff2": ["997d0336a2400872",39132,""],
    "fonts/BricolageGrotesque-Medium.woff2": ["844bc73118b3087d",39088,""],
    "fonts/BricolageGrotesque-Regular.woff2": ["67616b1dfc9ead9f",38936,""],
    "fonts/BricolageGrotesque-SemiBold.woff2": ["f2719a1dde356db9",39232,""],
    "fonts/IBMPlexSans-Bold.woff2": ["fa7130d854a660b3",63012,""],
    "fonts/IBMPlexSans-Medium.woff2": ["5660f8a658f8bb50",66740,""],
    "fonts/IBMPlexSans-Regular.woff2": ["ba711a3085ff9f27",63020,""],
    "fonts/IBMPlexSans-SemiBold.woff2": ["f78048030eab62e8",67060,""],
    "fonts/Inter-Black.woff2": ["eec0ae4bb52981a6",105920,""],
    "fonts/Inter-Bold.woff2": ["01191e5d895aab87",106844,""],
    "fonts/Inter-ExtraBold.woff2": ["c056aae4f379be89",107332,""],
    "fonts/Inter-Medium.woff2": ["d6e2531976fa618c",106108,""],
    "fonts/Inter-Regular.woff2": ["413a527c0ed1833f",99864,""],
    "fonts/Inter-SemiBold.woff2": ["07d609457ea2e93b",106168,""],
    "fonts/PlayfairDisplay-Black.woff2": ["d3a0c459b26c1a02",67088,""],
    "fonts/PlayfairDisplay-BlackItalic.woff2": ["a7ff5219048ee03f",62848,""],
    "fonts/PlayfairDisplay-Bold.woff2": ["1f92b3db0f82e09b",70232,""],
    "fonts/PlayfairDisplay-BoldItalic.woff2": ["1de749d77f8a6fca",67048,""],
    "fonts/PlayfairDisplay-ExtraBold.woff2": ["b0c5700b9c7c72c5",69836,""],
    "fonts/PlayfairDisplay-ExtraBoldItalic.woff2": ["ade38b68573d7970",66640,""],
    "fonts/PlayfairDisplay-Italic.woff2": ["5020ecb9ebdc9690",62476,""],
    "fonts/PlayfairDisplay-Medium.woff2": ["e0b7a9fc481fe8d9",69740,""],
    "fonts/PlayfairDisplay-MediumItalic.woff2": ["f05fd5d141bcac02",66404,""],
    "fonts/PlayfairDisplay-Regular.woff2": ["87f2f0e9a1d211c6",64856,""],
    "fonts/PlayfairDisplay-SemiBold.woff2": ["3994ab659f02cf36",69844,""],
    "fonts/PlayfairDisplay-SemiBoldItalic.woff2": ["1d51a28ba5a0e970",66848,""],
    "icons/apple-touch-icon.png": ["dd2fda7c07cbd217",41749,""],
    "icons/favicon-16x16.png": ["394740455519b067",930,""],
    "icons/favicon-32x32.png": ["3bfaad230598082a",2857,""],
    "icons/icon-192.png": ["c0983f51427f87b6",57754,""],
    "icons/icon-512.png": ["3f52301ac96dcf24",254500,""],
    "icons/icon-maskable-512.png": ["fa2a6ac20c30f623",202332,""],
    "icons/splash-logo.jpg": ["589d20f8f5ee9da6",22872,""],
    "index.html": ["477a02e99ab019f7",68854,""],
    "js/core/app-shell.desktop.js": ["d56e70c14d119cc6",8092,""],
    "js/core/app-shell.js": ["1d8f6011cfe0f647",52671,""],
    "js/core/app.entry.js": ["27ff777222446034",11218,""],
    "js/core/bootstrap.js": ["1f1e8661eaef47a8",20650,""],
    "js/core/module-loader.js": ["4a52c35b42b6c3b6",6148,""],
    "js/core/rbi-core.js": ["9a09aa0085549130",7006,""],
    "js/core/router.js": ["a937a701adb81e0b",27541,""],
    "js/core/views.js": ["2aee99732cc01597",31332,""],
    "js/dist/company/chunks/exceljs.min-Cd0WKM3n.js": ["f113c5443f0643dc",1394665,"company"],
    "js/dist/company/chunks/xlsx-reader-CPcF3VtK.js": ["2434aeece60d858e",2160,"company"],
    "js/dist/company/company.js": ["9ea4479bee5e2c4c",1408074,"company"],
    "js/dist/construction-v2.js": ["a5e867f99a6562e9",337550,"construction-v2"],
    "js/dist/planfact/chunks/exceljs.min-Cd0WKM3n.js": ["f113c5443f0643dc",1394665,"planfact"],
    "js/dist/planfact/chunks/xlsx-reader-CPcF3VtK.js": ["2434aeece60d858e",2160,"planfact"],
    "js/dist/planfact/chunks/xlsx-writer-C1YpHX_s.js": ["70ba43f300adeb4d",12722,"planfact"],
    "js/dist/planfact/planfact.js": ["f391e8a25c2e487d",1710186,"planfact"],
    "js/dist/platform-admin/platform-admin.js": ["60eb5c906b7b4f8b",27845,"platform-admin"],
    "js/dist/platform/platform.js": ["a643e26651be79ce",852454,""],
    "js/dist/rbi-construction-acceptance.js": ["ea4a7f059ca0367b",14449,"construction"],
    "js/dist/rbi-construction-defects.js": ["4f86f24809f9ba0b",12130,"construction"],
    "js/dist/rbi-construction-units.js": ["b7010db3ee53912f",16918,"construction"],
    "js/dist/rbi-locations.js": ["e88ff09ef57e8044",31195,""],
    "js/modules/company/company.manifest.js": ["850f055e4703aed1",1434,""],
    "js/modules/company/index.js": ["0def60e56ba9eda4",9031,""],
    "js/modules/construction-v2/construction-v2.manifest.js": ["3260c4727ad7dc4a",2830,""],
    "js/modules/construction-v2/index.js": ["198cf47ab56aac85",324,"construction-v2"],
    "js/modules/construction/construction.actions.js": ["10009a3972004706",12342,"construction"],
    "js/modules/construction/construction.manifest.js": ["a6bafc4e134dde7b",1562,""],
    "js/modules/construction/construction.module.js": ["3b86612a571cdcef",5915,"construction"],
    "js/modules/construction/construction.render.js": ["732cefbfce2296e5",20841,"construction"],
    "js/modules/construction/construction.state.js": ["9b0d05d63360b127",3540,"construction"],
    "js/modules/construction/features/acceptance.js": ["9fc413a6abeb3167",47109,"construction"],
    "js/modules/construction/features/admin.js": ["a4f7b08b8e19f392",30269,"construction"],
    "js/modules/construction/features/construction-core.js": ["e2ab44c370dc6a11",56642,"construction"],
    "js/modules/construction/features/defect-form.js": ["59480f2b454f7cf9",72287,"construction"],
    "js/modules/construction/features/pdf-viewer.js": ["457c49e79d717ab4",30536,"construction"],
    "js/modules/construction/features/transfer.js": ["bab68c00a9a14ecb",15093,"construction"],
    "js/modules/construction/index.js": ["76cbabf6d244dd21",1011,"construction"],
    "js/modules/knowledge/features/faq.js": ["923b73981d28cdb3",79757,""],
    "js/modules/knowledge/features/reference.js": ["8a57a2a28c4109f8",149440,""],
    "js/modules/knowledge/index.js": ["e78203dbc1c2e34e",828,""],
    "js/modules/knowledge/knowledge.actions.js": ["213a269236ae7f2c",5159,""],
    "js/modules/knowledge/knowledge.desktop.checklists.js": ["f40aa71db8b6263d",25759,""],
    "js/modules/knowledge/knowledge.desktop.docs.js": ["f12137fea411bfbf",27642,""],
    "js/modules/knowledge/knowledge.desktop.nodes.js": ["6bda11a98ca928f5",29425,""],
    "js/modules/knowledge/knowledge.desktop.practices.js": ["afdd33800f70d861",36535,""],
    "js/modules/knowledge/knowledge.desktop.render.js": ["2cb08fc8b81a83d8",19067,""],
    "js/modules/knowledge/knowledge.desktop.twi.js": ["6360631a6a2e57c9",45748,""],
    "js/modules/knowledge/knowledge.manifest.js": ["afd0ac1028cf5dfe",1776,""],
    "js/modules/knowledge/knowledge.module.js": ["9a3884f584d05554",276063,""],
    "js/modules/knowledge/knowledge.render.js": ["5ce05b4b1684a07d",28972,""],
    "js/modules/knowledge/knowledge.state.js": ["74b4b8a91892d562",7772,""],
    "js/modules/knowledge/twi.docx-export.js": ["bd5c958a5c92c51a",28903,""],
    "js/modules/modules.manifest.d.ts": ["0f8375887572f52d",811,""],
    "js/modules/modules.manifest.js": ["12bd76b9dd6d6fb7",1998,""],
    "js/modules/planfact/index.js": ["e359f78f83fb07a3",12512,""],
    "js/modules/planfact/planfact.manifest.js": ["c62b34d5b4b7ff2f",5985,""],
    "js/modules/quality/features/ai/ai.actions.js": ["6931c8c275369567",258576,"quality"],
    "js/modules/quality/features/ai/ai.manifest.js": ["be59786506d712f7",1460,""],
    "js/modules/quality/features/ai/ai.module.js": ["f1aa6232f6d1a16c",14877,"quality"],
    "js/modules/quality/features/ai/ai.render.js": ["c6885bce742a5380",771,"quality"],
    "js/modules/quality/features/ai/ai.state.js": ["fb9158275f771181",1387,"quality"],
    "js/modules/quality/features/ai/index.js": ["d68158f79de25f2f",758,"quality"],
    "js/modules/quality/features/analytics/analytics.actions.js": ["2267131c45f64855",95068,"quality"],
    "js/modules/quality/features/analytics/analytics.desktop.render.js": ["20c1c2914edae643",105585,"quality"],
    "js/modules/quality/features/analytics/analytics.module.js": ["a8f916c151451eda",8841,"quality"],
    "js/modules/quality/features/analytics/analytics.pptx-export.js": ["c75923cf48085ade",16329,"quality"],
    "js/modules/quality/features/analytics/analytics.render.js": ["28e7221971f133c6",306874,"quality"],
    "js/modules/quality/features/analytics/analytics.risk-insight.js": ["94158f090ccaec61",16882,"quality"],
    "js/modules/quality/features/analytics/analytics.state.js": ["0a9070cf0f2bc11f",4052,"quality"],
    "js/modules/quality/features/analytics/history.desktop.content.js": ["0f1766d8a77e3474",51162,"quality"],
    "js/modules/quality/features/analytics/month-dynamics.calc.js": ["c06e41d5af53db59",35411,"quality"],
    "js/modules/quality/features/analytics/month-dynamics.charts.js": ["6a807e54effad8c5",14827,"quality"],
    "js/modules/quality/features/analytics/month-dynamics.report.js": ["753098f264027a42",46692,"quality"],
    "js/modules/quality/features/analytics/month-dynamics.view.js": ["7b28557481d7d62f",82979,"quality"],
    "js/modules/quality/features/analytics/schedule.desktop.content.js": ["bb1e1cef3fb0018c",6169,"quality"],
    "js/modules/quality/features/analytics/sk.desktop.content.js": ["448417da7c02104a",41601,"quality"],
    "js/modules/quality/features/analytics/sk.issue-rules.js": ["1667be18123016d9",6090,"quality"],
    "js/modules/quality/features/audit/audit.actions.js": ["bfa1ba983ce19a83",68895,"quality"],
    "js/modules/quality/features/audit/audit.desktop.render.js": ["1a5d7a4b27a672e3",34184,"quality"],
    "js/modules/quality/features/audit/audit.module.js": ["b40f223385fde235",10888,"quality"],
    "js/modules/quality/features/audit/audit.render.js": ["436eb918334af8f2",76944,"quality"],
    "js/modules/quality/features/audit/audit.state.js": ["09aec5e32b3a2364",6258,"quality"],
    "js/modules/quality/features/audit/features/quality-plan-pin.js": ["e4fda2159da7fb8b",53758,"quality"],
    "js/modules/quality/features/engineer/engineer.actions.js": ["b855da9b0e995dc7",2074,"quality"],
    "js/modules/quality/features/engineer/engineer.desktop.render.js": ["bc3c284c2006e037",100206,"quality"],
    "js/modules/quality/features/engineer/engineer.module.js": ["71277c6c9e68373c",3828,"quality"],
    "js/modules/quality/features/engineer/engineer.render.js": ["7f6acfb8bbe49547",22709,"quality"],
    "js/modules/quality/features/engineer/engineer.state.js": ["98242afc05867caa",2743,"quality"],
    "js/modules/quality/features/etalon/etalon-v18.actions.js": ["52b16a035dd8c4e5",45136,"quality"],
    "js/modules/quality/features/etalon/etalon-v18.render.js": ["81ddbe143eb56393",23646,"quality"],
    "js/modules/quality/features/etalon/etalon-v18b.actions.js": ["df93029ea980de9f",26350,"quality"],
    "js/modules/quality/features/etalon/etalon-v18b.frame.html": ["1ebc642c3f63084b",2686189,"quality"],
    "js/modules/quality/features/etalon/etalon-v18b.render.js": ["921f70de19ebd2b8",6028,"quality"],
    "js/modules/quality/features/etalon/etalon.actions.js": ["6fb1998470569424",65833,"quality"],
    "js/modules/quality/features/etalon/etalon.docx-export.js": ["8d3dd5eb9b07a2d6",26727,"quality"],
    "js/modules/quality/features/etalon/etalon.module.js": ["9662330077e6c2e1",5453,"quality"],
    "js/modules/quality/features/etalon/etalon.render.js": ["af07da8d6328129a",11869,"quality"],
    "js/modules/quality/features/etalon/etalon.state.js": ["be5dfad60a12905a",1346,"quality"],
    "js/modules/quality/features/gamification/game.actions.js": ["b4a960d152dc31ea",176064,"quality"],
    "js/modules/quality/features/gamification/game.manifest.js": ["65d155a74a48f399",1334,""],
    "js/modules/quality/features/gamification/game.module.js": ["f0998764ea971b61",11376,"quality"],
    "js/modules/quality/features/gamification/game.render.js": ["f1e40ec658135959",163760,"quality"],
    "js/modules/quality/features/gamification/game.state.js": ["dfbf23ce4f7d36da",48083,"quality"],
    "js/modules/quality/features/gamification/index.js": ["306c6e40a71a6864",786,"quality"],
    "js/modules/quality/features/history/history.actions.js": ["6946e4e3f6bdf08b",22053,"quality"],
    "js/modules/quality/features/history/history.group.js": ["63f47bd0057e37de",2919,"quality"],
    "js/modules/quality/features/history/history.module.js": ["5278f0b03126f1cf",6352,"quality"],
    "js/modules/quality/features/history/history.render.js": ["57885279635a10ac",92074,"quality"],
    "js/modules/quality/features/history/history.state.js": ["585494cf9b568f9e",8365,"quality"],
    "js/modules/quality/features/interventions.js": ["802a197cd15d7714",140877,"quality"],
    "js/modules/quality/features/meetings/meetings.actions.js": ["2397aec3df064b79",4480,"quality"],
    "js/modules/quality/features/meetings/meetings.docx-export.js": ["b834634da2642bba",27877,"quality"],
    "js/modules/quality/features/meetings/meetings.module.js": ["802b9adb3b04617e",159959,"quality"],
    "js/modules/quality/features/meetings/meetings.protocol.js": ["6c99e6ebe5a6fc82",38462,"quality"],
    "js/modules/quality/features/meetings/meetings.render.js": ["85b90c63d3a2201a",1038,"quality"],
    "js/modules/quality/features/meetings/meetings.state.js": ["488b8898197062ba",1315,"quality"],
    "js/modules/quality/features/practice.pptx-export.js": ["4395bd6801a78f49",15115,"quality"],
    "js/modules/quality/features/reports/report-kind.js": ["2175baa0ade7c514",5539,"quality"],
    "js/modules/quality/features/reports/report-preview.js": ["1daa865ab4fbdecf",8605,"quality"],
    "js/modules/quality/features/reports/reports.actions.js": ["d71a5fdb8e063ec3",666428,"quality"],
    "js/modules/quality/features/reports/reports.module.js": ["9c22b9fe41c188bf",7936,"quality"],
    "js/modules/quality/features/reports/reports.pptx-export.js": ["5b235d981ba4a120",59926,"quality"],
    "js/modules/quality/features/reports/reports.pptx-viewer.js": ["e5a9cfd181ea48fc",7963,"quality"],
    "js/modules/quality/features/reports/reports.render.js": ["fa799af0d864f69f",3754,"quality"],
    "js/modules/quality/features/reports/reports.state.js": ["ec8bbf39f57b71fb",2476,"quality"],
    "js/modules/quality/features/schedule/schedule.actions.js": ["fc798f8453f377b1",15083,"quality"],
    "js/modules/quality/features/schedule/schedule.module.js": ["384974f9f683f6ca",4705,"quality"],
    "js/modules/quality/features/schedule/schedule.render.js": ["209e34086fbf86ef",27307,"quality"],
    "js/modules/quality/features/schedule/schedule.state.js": ["e8ff731725bdafe4",1303,"quality"],
    "js/modules/quality/features/shared/multi-filter.js": ["1b6fad91b480c5cf",38003,"quality"],
    "js/modules/quality/features/shared/plan-pin-label.js": ["88fa5c5cd50176cc",5904,"quality"],
    "js/modules/quality/features/shared/plan-pin-print.js": ["2f4d86cce3523b9d",5565,"quality"],
    "js/modules/quality/features/sk/index.js": ["14df2a9bdbe9fe9d",758,"quality"],
    "js/modules/quality/features/sk/sk.actions.js": ["05664b95a6c8583a",82442,"quality"],
    "js/modules/quality/features/sk/sk.links.js": ["27a909587418e737",33349,"quality"],
    "js/modules/quality/features/sk/sk.manifest.js": ["68fcbece42cb1dbf",1643,""],
    "js/modules/quality/features/sk/sk.module.js": ["46454369d44799d0",9544,"quality"],
    "js/modules/quality/features/sk/sk.render.js": ["27cb5f9da4fd965a",107408,"quality"],
    "js/modules/quality/features/sk/sk.state.js": ["2ab85496b502636d",2225,"quality"],
    "js/modules/quality/features/tasks/tasks.actions.js": ["c113212551be6cf7",4792,"quality"],
    "js/modules/quality/features/tasks/tasks.module.js": ["f2d816b9033c14a9",205783,"quality"],
    "js/modules/quality/features/tasks/tasks.render.js": ["4ee7cd12ca4464a8",2772,"quality"],
    "js/modules/quality/features/tasks/tasks.state.js": ["90d0302ed1b217a0",2707,"quality"],
    "js/modules/quality/index.js": ["9f82720a2feb8972",853,"quality"],
    "js/modules/quality/manifest.js": ["df03a8cdb6385205",9839,""],
    "js/modules/quality/quality.module.js": ["45ddf8533e8d0b82",3257,"quality"],
    "js/modules/settings/features/app-mode-utils.js": ["fdffbdafd7dda98a",89242,""],
    "js/modules/settings/features/changelog.js": ["b1ede15df69b01d6",85281,""],
    "js/modules/settings/features/cloud-deleted-purge-ui.js": ["d23b0fd665ece0f9",29571,""],
    "js/modules/settings/features/cloud-orphan-urls-ui.js": ["d2a18252f782503c",26090,""],
    "js/modules/settings/features/contractor-directory-ui.js": ["7f8665f71dd640c4",28473,""],
    "js/modules/settings/features/contractor-id-backfill-ui.js": ["5c0585b8c9138090",9736,""],
    "js/modules/settings/features/feedback.js": ["a86fdce44b7037c5",37461,""],
    "js/modules/settings/features/location-directory-ui.js": ["ef49f8b231efc693",31014,""],
    "js/modules/settings/features/official-templates-ui.js": ["bf5ba8e432667382",15730,""],
    "js/modules/settings/features/project-id-backfill-ui.js": ["78965bccc97f4699",12726,""],
    "js/modules/settings/features/role-matrix-ui.js": ["ceb338665df0b4bf",23958,""],
    "js/modules/settings/features/tutorial.js": ["ba71f37c6183ea98",63195,""],
    "js/modules/settings/index.js": ["5c4ef31bcbdc08b5",818,""],
    "js/modules/settings/settings.actions.js": ["afdcf382d60ef440",36326,""],
    "js/modules/settings/settings.desktop.render.js": ["76d739c2d52fa7eb",8464,""],
    "js/modules/settings/settings.manifest.js": ["cb8fb906246cb924",752,""],
    "js/modules/settings/settings.module.js": ["9acc04e635d95ffc",13540,""],
    "js/modules/settings/settings.nav.js": ["686d48ca74504399",14185,""],
    "js/modules/settings/settings.render.js": ["24d66ef454ff66ff",208844,""],
    "js/modules/settings/settings.routes.js": ["03a11c3b25a05c68",6753,""],
    "js/services/ai.service.js": ["81319b59599cf8c6",3352,""],
    "js/services/analytics.service.js": ["c3713abe691ce61d",5827,""],
    "js/services/app-mode.service.js": ["3d18214b2eee6f81",2137,""],
    "js/services/company.service.js": ["4e572853e3816579",15292,""],
    "js/services/config.service.js": ["92754ac47eea9f80",3005,""],
    "js/services/contractor-directory.service.js": ["67818b1901038039",47075,""],
    "js/services/contractor-metrics.service.js": ["a5942bd8380696bc",12817,""],
    "js/services/file.service.js": ["6bfe5ab29d34d8a8",1140,""],
    "js/services/game.service.js": ["e98eb64649a432d6",6020,""],
    "js/services/i18n.service.js": ["0223ca65ea80bda3",5587,""],
    "js/services/inspection.service.js": ["522113da08639f39",11829,""],
    "js/services/knowledge.service.js": ["783e2a4201b0136e",17821,""],
    "js/services/masterData.service.js": ["d9164c50f3c09dfb",3195,""],
    "js/services/object-directory.service.js": ["2e31ff108a7f1dbc",89272,""],
    "js/services/permission.service.js": ["a8eefcdd32d68eea",44546,""],
    "js/services/record-id.service.d.ts": ["f75587a354e9efe7",726,""],
    "js/services/record-id.service.js": ["c124acb7cb95f2b0",6067,""],
    "js/services/report.service.js": ["84ec6c874f93a4e3",7011,""],
    "js/services/session.service.js": ["0af7856bf406ff7f",13966,""],
    "js/services/settings.service.js": ["213f2b38598d8329",12339,""],
    "js/services/sk.service.js": ["c8ebaa74585eca76",7319,""],
    "js/services/storage.service.js": ["248032d4494ceb8a",4001,""],
    "js/services/storage/checklist-snapshot.utils.js": ["7d5230dec8f2d4f1",5441,""],
    "js/services/storage/history-memory.utils.js": ["88b0b2166bb100fc",4583,""],
    "js/services/storage/storage-cache-manager.js": ["9a3196d27d93bdd2",69382,""],
    "js/services/storage/storage-converters.utils.js": ["5b768eb8ecb3da99",6994,""],
    "js/services/storage/storage-db.core.js": ["cb8d5c153815d3aa",42133,""],
    "js/services/storage/storage-diagnostics.render.js": ["768558d07b1973df",11900,""],
    "js/services/storage/storage-file-queue.actions.js": ["ec698ad569d78c8c",37822,""],
    "js/services/storage/storage-offline-cache.utils.js": ["c765f648fea5afe6",18917,""],
    "js/services/storage/storage-photo-loader.js": ["50e85e40a2287622",12852,""],
    "js/services/storage/storage-photo-manager.js": ["59967b9fafc9a9a6",38296,""],
    "js/services/sync.service.js": ["a1d0efd8d9b20a2c",2859,""],
    "js/services/sync/sync-access.policy.js": ["cfcbc5a9f9d58490",36026,""],
    "js/services/sync/sync-auth.js": ["d2dfa72b55853417",10971,""],
    "js/services/sync/sync-cloud-prepare.utils.js": ["5d1e40c5615b7aec",26251,""],
    "js/services/sync/sync-connection.actions.js": ["c03e9fb129de969e",33859,""],
    "js/services/sync/sync-core.state.js": ["8210205e47f88b84",24463,""],
    "js/services/sync/sync-engine.core.js": ["3a05f650395d7ff6",319524,""],
    "js/services/sync/sync-journal.policy.js": ["1ea3d3c7b4f08140",7669,""],
    "js/services/sync/sync-merge.policy.js": ["6cf44faf287a1a1f",7159,""],
    "js/services/sync/sync-net.policy.js": ["8ca918d5aee3540e",9752,""],
    "js/services/sync/sync-post-actions.js": ["b70e3b9c9fb7fdb0",10576,""],
    "js/services/sync/sync-progress.ui.js": ["4ec0843bd1d3f622",14900,""],
    "js/services/sync/sync-pull.policy.js": ["36e7af8fa5836408",14208,""],
    "js/services/sync/sync-push-pull.core.js": ["e096f319232cdcca",26758,""],
    "js/services/sync/sync-retry.policy.js": ["1fd88a0222131c6d",15091,""],
    "js/services/sync/sync-ui.render.js": ["f49203b01796a35c",27126,""],
    "js/services/task.service.js": ["11d44c8e1c004c53",6752,""],
    "js/services/template.service.js": ["d985155c606e2c51",8411,""],
    "js/services/user-context.service.js": ["a7802f0d38615604",2742,""],
    "js/shared/app-update.policy.js": ["927633d26da6f3fb",3649,""],
    "js/shared/checklist-runner.js": ["016a9bac9031365f",34049,""],
    "js/shared/error-log.utils.js": ["34a211d8496e89fd",2381,""],
    "js/shared/fab-export.utils.js": ["475d6847652a1cd9",16867,""],
    "js/shared/form-draft.utils.js": ["41348b5a3a1b26c5",8810,""],
    "js/shared/layout.utils.js": ["0e92b8b2bffe258c",11640,""],
    "js/shared/math.utils.js": ["a835b3630faca1a1",44209,""],
    "js/shared/notify.utils.js": ["f5dbddfb44217906",5087,""],
    "js/shared/pdf-open.utils.js": ["d2a0c7105f99f8a3",24195,""],
    "js/shared/pdfjs-loader.js": ["f72af2f387669e27",1678,""],
    "js/shared/photo-editor.utils.js": ["658b4356bd1d565e",27484,""],
    "js/shared/photo-viewer-zoom.utils.js": ["0e61ef104ea46f48",7009,""],
    "js/shared/plan-panzoom.utils.js": ["6ee5e0acbc8e06a9",3409,""],
    "js/shared/pwa-update.utils.js": ["bc6e56086c2673fb",14048,""],
    "js/shared/smart-input.utils.js": ["33f5f1aafaf56e61",23171,""],
    "js/shared/snake-game.utils.js": ["16c5fe2f47acf098",7191,""],
    "js/shared/splash-screen.utils.js": ["bb4a3e44e9ca1217",1986,""],
    "js/shared/sync-live-paint.policy.js": ["e86ee32cede6952d",3686,""],
    "js/shared/sync-ui-defer.utils.js": ["8899054892da83db",13797,""],
    "js/shared/system-templates-locale.js": ["672f781d44232563",5895,""],
    "js/shared/template.utils.js": ["14c50e9e1709e44a",3099,""],
    "js/shared/theme.utils.js": ["8ace8cf4fa2fad08",6504,""],
    "js/shared/toast.utils.js": ["0cc2908ebbf913bf",1353,""],
    "js/shared/touch-gestures.utils.js": ["e34fc68e97b6b199",2386,""],
    "js/shared/ui-motion.utils.js": ["f876c2b44136e968",3798,""],
    "libs/Sortable.min.js": ["bf4241bc73fef7f1",45478,""],
    "libs/chart.umd.min.js": ["48444a82d4edcb5b",208522,""],
    "libs/docx.bundle.js": ["e27d082d20a733f7",1123361,""],
    "libs/html2pdf.bundle.min.js": ["85e6ee9ce246e3ae",905956,""],
    "libs/panzoom.min.js": ["3ce354ef7b493efb",10125,""],
    "libs/pdfjs/LICENSE": ["0d542e0c8804e39a",10174,""],
    "libs/pdfjs/pdf.min.js": ["93a1c3b810682207",496989,""],
    "libs/pdfjs/pdf.worker.min.js": ["cd10f3bdfa9bb5eb",1286284,""],
    "libs/pdfjs/wasm/LICENSE_JBIG2": ["9e66b7f1b934a28b",12862,""],
    "libs/pdfjs/wasm/LICENSE_OPENJPEG": ["a6af136f3e15038a",2112,""],
    "libs/pdfjs/wasm/LICENSE_PDFJS_JBIG2": ["aad3cce09842e00e",555,""],
    "libs/pdfjs/wasm/LICENSE_PDFJS_OPENJPEG": ["717fc62da03292db",1285,""],
    "libs/pdfjs/wasm/LICENSE_PDFJS_QCMS": ["eb5104ca33552be0",1285,""],
    "libs/pdfjs/wasm/LICENSE_QCMS": ["36d847ae882f6574",1121,""],
    "libs/pdfjs/wasm/jbig2.wasm": ["e6bee67724a7b543",104852,""],
    "libs/pdfjs/wasm/openjpeg.wasm": ["004a0e62db930ba9",252032,""],
    "libs/pdfjs/wasm/qcms_bg.wasm": ["bfdaeb649178748e",88837,""],
    "libs/pptxgenjs.bundle.js": ["4fb9eac5cfefb213",460889,""],
    "libs/pptxviewjs.min.js": ["f38d4b2d5fc4b526",621122,""],
    "libs/qrcode.min.js": ["c541ef06327885a8",19927,""],
    "libs/supabase-js.min.js": ["df19aeb6c97ef48c",200135,""],
    "libs/tailwindcdn.js": ["176e894661aa9cdc",407279,""],
    "libs/xlsx.full.min.js": ["c9506197caf809a0",881727,""],
    "locales/en.json": ["edae0324ef388298",216462,""],
    "locales/ka.json": ["84bc48e21567050a",370942,""],
    "locales/ru.json": ["5896f8a4bd475273",283885,""],
    "locales/sr-Latn.json": ["7b4d3f5e747e46cb",222599,""],
    "manifest.webmanifest": ["b9a36dbce360f064",713,""],
    "report.html": ["31a1aae98cdd97be",20495,""],
    "Шаблон_акта_эталона_в_18.html": ["b982ad8197f3f536",2616784,""]
  }
};
// </app-version>
const SW_VERSION = APP_RELEASE.version;
// P2-0013: «разработка / выпуск» — из единственного переключателя js/services/config.service.js (выпуск: rbi-quality-* вместо старой версии).
importScripts('./js/services/config.service.js');
const CACHE_PREFIX = (self.APP_CONFIG && self.APP_CONFIG.SW_CACHE_PREFIX) || 'platform2-';
const CACHE_NAME = `${CACHE_PREFIX}v${SW_VERSION}`;
// P2-0032: кэш старого приложения РБИ (тот же адрес app.rbi-q.ru) — удаляется при установке Платформы 2.0.
const LEGACY_CACHE_PREFIX = 'rbi-quality-';
function hasLegacyCache() {
  return caches.keys().then((names) => names.some((n) => n.startsWith(LEGACY_CACHE_PREFIX))).catch(() => false);
}

// ==========================================
// P2-0066: ВЕРСИЯ ЦЕЛИКОМ
// ==========================================
// Версия ставится в свой кэш `platform2-v<версия>` целиком: оболочка + допущенные модули (P2-0013) по описи APP_RELEASE.
// Файл с тем же отпечатком берётся из прежней версии без сети, остальные скачиваются и сверяются с отпечатком. Любая ошибка —
// установка не удалась, прежняя версия работает. Файлы приложения отдаются только из кэша той версии, на которой открыта
// вкладка (вкладка = версия); сеть в фоне кэш не переписывает. Прежняя версия хранится, пока открыта хоть одна её вкладка.
const SCOPE = self.registration.scope;
const VERSION_PREFIX = CACHE_PREFIX + 'v';
const META_CACHE = 'p2-app-meta';          // постоянная память: допуск модулей, вкладка → версия, устанавливаемая версия
const HASH_HEADER = 'x-p2-hash';
const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

/** Путь файла приложения внутри области (без ?…), корень → index.html; не файл приложения → null. */
function appPath(url) {
  if (!url.startsWith(SCOPE)) return null;
  let p = url.slice(SCOPE.length).split(/[?#]/)[0];
  try { p = decodeURIComponent(p); } catch (e) { return null; }
  if (p === '') p = 'index.html';
  return hasOwn(APP_RELEASE.files, p) ? p : null;
}
const keyOf = (path) => new URL(path, SCOPE).href;

async function metaGet(key, dflt) {
  try { const r = await (await caches.open(META_CACHE)).match('/__' + key); return r ? await r.json() : dflt; } catch (e) { return dflt; }
}
async function metaSet(key, value) {
  try { await (await caches.open(META_CACHE)).put('/__' + key, new Response(JSON.stringify(value))); } catch (e) { /* память недоступна */ }
}

// --- Допуск модулей (P2-0013): RBI_SW_ALLOWLIST (Качество, СК) и P2_SW_ALLOWLIST (План/Факт, «Компания», Админка).
// null — допуск ещё не приходил. Хранится в постоянной памяти: после перезапуска кэша приложения он на месте.
let allowedModules = null;
let p2AllowedModules = null;
let allowLoaded = null;
function loadAllow() {
  if (!allowLoaded) allowLoaded = metaGet('allow', {}).then((a) => {
    if (allowedModules === null && Array.isArray(a.rbi)) allowedModules = a.rbi;
    if (p2AllowedModules === null && Array.isArray(a.p2)) p2AllowedModules = a.p2;
  });
  return allowLoaded;
}
/** Группа пути по правилу описи: '' — оболочка, иначе модуль (манифесты модулей — оболочка). Работает и для файлов прежних версий. */
function groupOfPath(path) {
  if (/(^|\/)[^/]*manifest\.js$/.test(path)) return '';
  const m = APP_RELEASE.prefixes.find((x) => path.startsWith(x[0]));
  return m ? m[1] : '';
}
const relPath = (url) => (url.startsWith(SCOPE) ? url.slice(SCOPE.length).split(/[?#]/)[0] : '');
const allowListOf = (group) => (APP_RELEASE.modules[group] === 'p2' ? p2AllowedModules : allowedModules);
/** Группа описи допущена: оболочка — всегда; модуль — если он в допуске. */
function groupAllowed(group) {
  if (!group) return true;
  const list = allowListOf(group);
  return Array.isArray(list) && list.indexOf(group) !== -1;
}
/** Группу можно класть в кэш: допущена или допуск ещё не приходил (первый запуск до ответа входа). */
const groupMayCache = (group) => !group || allowListOf(group) === null || groupAllowed(group);
/** P2-0013: файл можно держать в кэше приложения (модуль допущен или допуск ещё не приходил). */
function mayCachePut(url) { return groupMayCache(groupOfPath(relPath(url))); }

// --- Вкладка → версия (по id вкладки; задаётся при открытии вкладки): { id: [кэш версии, когда открыта] }.
let clientMap = null;
async function getClientMap() { if (!clientMap) clientMap = await metaGet('clients', {}); return clientMap; }
async function recordClient(id) {
  const m = await getClientMap();
  m[id] = [CACHE_NAME, Date.now()];
  await metaSet('clients', m);
}
const versionOfClient = async (id) => { const v = id && (await getClientMap())[id]; return v ? v[0] : null; };

/** Удалить версии, которыми больше никто не пользуется: не текущая, не устанавливаемая, ни одной открытой вкладки.
 *  Только что открытая вкладка (≤ 1 мин) может ещё не значиться среди открытых — её запись не трогаем. */
async function cleanupVersions() {
  const live = new Set((await self.clients.matchAll({ includeUncontrolled: true })).map((c) => c.id));
  const m = await getClientMap();
  let changed = false;
  for (const [id, v] of Object.entries(m)) if (!live.has(id) && !(Array.isArray(v) && Date.now() - v[1] < 60000)) { delete m[id]; changed = true; }
  if (changed) await metaSet('clients', m);
  const keep = new Set([CACHE_NAME, ...Object.values(m).map((v) => v[0])]);
  const reg = self.registration;
  if (reg.installing || reg.waiting) keep.add(await metaGet('installing', ''));
  for (const n of await caches.keys()) if (n.startsWith(VERSION_PREFIX) && !keep.has(n)) await caches.delete(n);
}

// --- Ход установки: страница показывает его в строке версии.
let progress = { state: 'idle', version: SW_VERSION, done: 0, total: 0 };
let notifyAt = 0;
async function notify(force) {
  const now = Date.now();
  if (!force && now - notifyAt < 500) return;
  notifyAt = now;
  const list = await self.clients.matchAll({ includeUncontrolled: true, type: 'window' }).catch(() => []);
  list.forEach((c) => c.postMessage({ type: 'P2_APP_UPDATE', ...progress }));
}

const hex = (buf) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
/** Скачать файл описи и сверить с отпечатком; ответ — с отпечатком в заголовке (по нему следующая версия возьмёт файл без сети). */
async function fetchVerified(path, hash) {
  let res;
  try { res = await fetch(keyOf(path), { cache: 'reload' }); } catch (e) { throw Object.assign(new Error('нет связи: ' + path), { reason: 'network' }); }
  if (!res.ok) throw Object.assign(new Error(`ответ ${res.status}: ${path}`), { reason: 'network' });
  const buf = await res.arrayBuffer();
  if (hex(await crypto.subtle.digest('SHA-256', buf)).slice(0, 16) !== hash) {
    throw Object.assign(new Error('файл другой версии (выкладка ещё идёт?): ' + path), { reason: 'mismatch' });
  }
  return new Response(buf, { status: 200, headers: { 'Content-Type': res.headers.get('Content-Type') || '', [HASH_HEADER]: hash } });
}

/** Тот же файл (по отпечатку) в другой версии — копия без сети. */
async function findCopy(names, path, hash) {
  for (const n of names) {
    const r = await (await caches.open(n)).match(keyOf(path));
    if (r && r.headers.get(HASH_HEADER) === hash) return r;
  }
  return null;
}

/** Положить в кэш версии файлы описи (list — [путь, [отпечаток, размер, группа]]), по 6 сразу. */
async function fillVersion(cache, list, onDone) {
  const others = (await caches.keys()).filter((n) => n.startsWith(VERSION_PREFIX) && n !== CACHE_NAME);
  let i = 0;
  const worker = async () => {
    while (i < list.length) {
      const [path, [hash]] = list[i++];
      const have = await cache.match(keyOf(path));
      if (!have || have.headers.get(HASH_HEADER) !== hash) {
        await cache.put(keyOf(path), (await findCopy(others, path, hash)) || (await fetchVerified(path, hash)));
      }
      onDone();
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
}

async function installVersion() {
  await loadAllow();
  await metaSet('installing', CACHE_NAME);
  const list = Object.entries(APP_RELEASE.files).filter(([, v]) => groupAllowed(v[2]));
  progress = { state: 'downloading', version: SW_VERSION, done: 0, total: list.length };
  await notify(true);
  try {
    await fillVersion(await caches.open(CACHE_NAME), list, () => { progress.done++; notify(); });
  } catch (e) {
    const reason = e && e.name === 'QuotaExceededError' ? 'space' : (e && e.reason) || 'network';
    progress = { ...progress, state: 'failed', reason };
    console.log('[SW] Версия не установлена:', SW_VERSION, e && e.message);
    await notify(true);
    throw e;
  }
  progress = { ...progress, state: 'ready' };
  await notify(true);
}

/** Допуск пришёл: модули без допуска — из всех версий долой, допущенные — докачать той же версии (не вышло — догрузятся при открытии). */
async function applyAllow() {
  for (const n of await caches.keys()) {
    if (!n.startsWith(VERSION_PREFIX)) continue;
    const c = await caches.open(n);
    for (const req of await c.keys()) if (!mayCachePut(req.url)) await c.delete(req);
  }
  const list = Object.entries(APP_RELEASE.files).filter(([, v]) => v[2] && groupAllowed(v[2]));
  await fillVersion(await caches.open(CACHE_NAME), list, () => {}).catch((e) => console.log('[SW] Модули не докачаны:', e && e.message));
}

// 1. УСТАНОВКА — версия целиком (см. выше). Первая установка (нет действующей версии) и поверх старого приложения РБИ
// (P2-0032: его страница не знает новых файлов и может зависнуть) включаются сразу; обновление ждёт переключения
// (при запуске / при возврате из фона / «Перезапустить сейчас» → postMessage('SKIP_WAITING')).
self.addEventListener('install', (event) => {
  const legacyAtStart = hasLegacyCache();   // P2-0032: до скачивания — пока кэш старого приложения на месте
  event.waitUntil(installVersion()
    .then(() => Promise.all([legacyAtStart, hasLegacyCache()]))
    .then(([a, b]) => { if (!self.registration.active || a || b) return self.skipWaiting(); }));
});

// 2. АКТИВАЦИЯ: кэш старого приложения РБИ — удалить; свои прежние версии — когда закрыта их последняя вкладка.
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    const legacy = names.some((n) => n.startsWith(LEGACY_CACHE_PREFIX));
    await Promise.all(names.filter((n) => n.startsWith(LEGACY_CACHE_PREFIX)).map((n) => caches.delete(n)));
    await self.clients.claim();
    await cleanupVersions();
    if (!legacy) return;
    // окна, открытые старым приложением (или зависшие на смеси старых и новых файлов), — перезагрузить один раз
    const list = await self.clients.matchAll({ type: 'window' });
    await Promise.all(list.map((c) => (typeof c.navigate === 'function' ? c.navigate(c.url).catch(() => null) : null)));
  })());
});

/** Файл приложения — из кэша версии вкладки. Нет в кэше (модуль ещё не докачан): сеть; файл этой версии — в кэш. */
async function serveApp(event, path) {
  let name = CACHE_NAME;
  if (event.request.mode === 'navigate') {
    if (event.resultingClientId) event.waitUntil(recordClient(event.resultingClientId).then(cleanupVersions).catch(() => {}));
  } else {
    const v = await versionOfClient(event.clientId);
    if (v && v !== CACHE_NAME && (await caches.has(v))) name = v;
  }
  const cache = await caches.open(name);
  const hit = await cache.match(keyOf(path));
  if (hit) return hit;
  const res = await fetch(event.request).catch(() => null);
  if (!res || !res.ok || name !== CACHE_NAME) return res || Response.error();
  const hash = APP_RELEASE.files[path][0];
  const buf = await res.clone().arrayBuffer();
  if (hex(await crypto.subtle.digest('SHA-256', buf)).slice(0, 16) === hash) {
    if (mayCachePut(event.request.url)) {
      event.waitUntil(cache.put(keyOf(path), new Response(buf, { status: 200, headers: { 'Content-Type': res.headers.get('Content-Type') || '', [HASH_HEADER]: hash } })));
    }
  } else {
    event.waitUntil(self.registration.update().catch(() => {}));   // на сервере уже другая версия — пусть ставится целиком
  }
  return res;
}

// 3. ПЕРЕХВАТ ЗАПРОСОВ
// P2-0016 (ADR-068): файлы компаний — в закрытых бакетах quality-*. Ссылки в записях Качества остаются «публичного» вида
// (…/object/public/quality-…); кэш приложения подставляет вход вошедшего (токен присылает страница — сообщение P2_STORAGE_TOKEN)
// и берёт файл по …/object/authenticated/…. Только сервер платформы (APP_CONFIG.P2_SUPABASE_URL). Нет связи — офлайн-кэш.
let p2StorageToken = null;
let p2TokenKnown = false;   // страница уже сообщила (в т.ч. «вышли» — null): не ждать
let p2TokenWaiters = [];
const P2_STORAGE_ORIGIN = (() => { try { return new URL(self.APP_CONFIG.P2_SUPABASE_URL).origin; } catch (e) { return ''; } })();

// P2-0057: планы мест ядра — закрытый бакет core-place-plans (ссылка того же вида), берётся так же
function isCompanyFileUrl(url) {
  return !!P2_STORAGE_ORIGIN && (url.startsWith(P2_STORAGE_ORIGIN + '/storage/v1/object/public/quality-')
    || url.startsWith(P2_STORAGE_ORIGIN + '/storage/v1/object/public/core-place-plans/'));
}

async function p2Token() {
  if (p2TokenKnown) return p2StorageToken;
  const list = await self.clients.matchAll({ includeUncontrolled: true, type: 'window' });
  list.forEach((c) => c.postMessage({ type: 'P2_STORAGE_TOKEN_REQUEST' }));
  return new Promise((resolve) => {
    p2TokenWaiters.push(resolve);
    setTimeout(() => resolve(p2StorageToken), 3000);
  });
}

// P2-0018 (ТД №121): ответ сервера (в т.ч. 401/403 — нет входа или права) отдаётся как есть; офлайн-кэш — только без сети.
async function fetchCompanyFile(request) {
  const token = await p2Token();
  const url = request.url.replace('/storage/v1/object/public/', '/storage/v1/object/authenticated/');
  try {
    return await fetch(url, { headers: token ? { Authorization: 'Bearer ' + token, apikey: self.APP_CONFIG.P2_SUPABASE_ANON_KEY } : {} });
  } catch (e) {
    const cached = await caches.match(request, { ignoreVary: true });
    return cached || Response.error();
  }
}

// P2-0018 (ТД №121): закрытые файлы компаний в кэше — только текущего входа. Выход (токен сброшен) или другой
// «компания + пользователь» (сообщение страницы P2_STORAGE_SLOT) — такие файлы удаляются из всех кэшей.
const P2_SLOT_CACHE = 'p2-storage-slot', P2_SLOT_KEY = '/__p2_storage_slot';
function purgeCompanyFiles() {
  return caches.keys().then((names) => Promise.all(names.map((n) => caches.open(n).then((c) => c.keys()
    .then((keys) => Promise.all(keys.filter((r) => isCompanyFileUrl(r.url)).map((r) => c.delete(r))))))));
}
async function setStorageSlot(slot) {
  let prev = null;
  try {
    const c = await caches.open(P2_SLOT_CACHE);
    const hit = typeof c.match === 'function' ? await c.match(P2_SLOT_KEY) : null;
    prev = hit ? await hit.text() : null;
    if (prev !== slot) {
      await purgeCompanyFiles();
      await c.put(P2_SLOT_KEY, new Response(slot));
    }
  } catch (e) { await purgeCompanyFiles(); }
}

self.addEventListener('fetch', event => {
  if (!event.request.url.startsWith('http')) return;
  if (event.request.method !== 'GET') return;

  if (isCompanyFileUrl(event.request.url)) {
    event.respondWith(fetchCompanyFile(event.request));
    return;
  }

  // Облачное хранилище (Storage) и API Supabase (база, авторизация, функции) — браузер напрямую, без кэша приложения
  if (event.request.url.includes('/storage/v1/object/public/')) return;
  if (/\/(rest|auth|functions|realtime)\/v1\//.test(event.request.url)) return;

  // P2-0066: файлы приложения — только из кэша версии вкладки (без фоновой перепроверки у сервера, ТД 227); прочее — сеть
  const path = appPath(event.request.url);
  if (!path) return;
  event.respondWith(serveApp(event, path).catch(() => Response.error()));
});

// ==========================================
// PUSH УВЕДОМЛЕНИЯ
// ==========================================

// Слушаем приход Push-уведомления с сервера
self.addEventListener('push', function (event) {
  // Если сервер прислал данные, берем их. Иначе ставим заглушку.
  const data = event.data ? event.data.json() : { title: 'RBI Platform', body: 'У вас новое уведомление' };

  const options = {
    body: data.body,
    icon: './icons/icon-192.png',
    badge: './icons/icon-192.png',
    vibrate: [200, 100, 200],
    data: {
      url: data.url || '/' // Ссылка, куда перейти при клике
    }
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Слушаем клик пользователя по уведомлению
self.addEventListener('notificationclick', function (event) {
  event.notification.close(); // Закрываем уведомление

  // Открываем приложение по ссылке из уведомления
  event.waitUntil(
    clients.openWindow(event.notification.data.url)
  );
});

// ==========================================
// ПРИНУДИТЕЛЬНОЕ ОБНОВЛЕНИЕ КЭША
// ==========================================
self.addEventListener('message', (event) => {
  // Если получаем команду SKIP_WAITING от кнопки "Обновить" в интерфейсе
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting(); // Заставляем новый Service Worker немедленно взять управление на себя
    return;
  }
  // Platform runtime independence · столп A: allowlist shortIds → gate cache.put + purge
  if (event.data && event.data.type === 'RBI_SW_ALLOWLIST' && Array.isArray(event.data.modules)) {
    allowedModules = event.data.modules.slice();
    console.log('[SW] RBI_SW_ALLOWLIST:', allowedModules.join(','));
    event.waitUntil(loadAllow().then(() => metaGet('allow', {})).then((a) => metaSet('allow', { ...a, rbi: allowedModules })).then(applyAllow));
  }
  if (event.data && event.data.type === 'P2_STORAGE_TOKEN') {
    const had = p2StorageToken;
    p2StorageToken = typeof event.data.token === 'string' && event.data.token ? event.data.token : null;
    p2TokenKnown = true;
    // выход — закрытые файлы из кэша убрать (и после перезапуска кэша: по сохранённому слоту входа)
    if (!p2StorageToken) event.waitUntil(had ? purgeCompanyFiles().then(() => setStorageSlot('')) : setStorageSlot(''));
    const w = p2TokenWaiters; p2TokenWaiters = [];
    w.forEach((r) => r(p2StorageToken));
    return;
  }
  if (event.data && event.data.type === 'P2_STORAGE_SLOT' && typeof event.data.slot === 'string') {
    event.waitUntil(setStorageSlot(event.data.slot));
    return;
  }
  if (event.data && event.data.type === 'P2_SW_ALLOWLIST' && Array.isArray(event.data.modules)) {
    p2AllowedModules = event.data.modules.slice();
    console.log('[SW] P2_SW_ALLOWLIST:', p2AllowedModules.join(',') || '—');
    event.waitUntil(loadAllow().then(() => metaGet('allow', {})).then((a) => metaSet('allow', { ...a, p2: p2AllowedModules })).then(applyAllow));
  }
  // P2-0066: строка версии — номер, дата и ход установки этой версии
  if (event.data && event.data.type === 'P2_APP_VERSION' && event.source) {
    event.source.postMessage({ type: 'P2_APP_VERSION', version: SW_VERSION, date: APP_RELEASE.date, progress });
  }
});