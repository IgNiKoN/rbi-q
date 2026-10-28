/* Файл: sw.js */
// P2-0066: номер версии и список файлов не правятся руками — их пишет сборка (npm run build:version) в участок ниже.
// <app-version> — сгенерировано scripts/app-version.mjs (npm run build:version), руками не править
const APP_RELEASE = {
  version: '2026.10.29-c7496664',
  date: '2026-10-29',
  digest: 'c7496664',
  modules: {"planfact":"p2","company":"p2","platform-admin":"p2","construction-v2":"rbi","construction":"rbi","quality":"rbi"},
  files: {
    ".nojekyll": ["e3b0c44298fc1c14",0,""],
    "css/analytics.desktop.css": ["909efb47e2bdb9fa",118397,""],
    "css/app-shell.desktop.css": ["ede63172f4e50381",13109,""],
    "css/audit.desktop.css": ["1c94cbcc861ff89d",22407,""],
    "css/brand/rbi.css": ["4153d03ba8b90e97",2650,""],
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
    "icons/icon-512-2.png": ["aa778ccd441d82cf",1886769,""],
    "icons/icon-512.png": ["3f52301ac96dcf24",254500,""],
    "icons/icon-maskable-512.png": ["fa2a6ac20c30f623",202332,""],
    "index.html": ["ce644086ebefa7b8",67764,""],
    "js/core/app-shell.desktop.js": ["d56e70c14d119cc6",8092,""],
    "js/core/app-shell.js": ["abf1812fb2554ee7",52085,""],
    "js/core/app.entry.js": ["27ff777222446034",11218,""],
    "js/core/bootstrap.js": ["1f1e8661eaef47a8",20650,""],
    "js/core/module-loader.js": ["4a52c35b42b6c3b6",6148,""],
    "js/core/rbi-core.js": ["9a09aa0085549130",7006,""],
    "js/core/router.js": ["9e092662775bb98a",26181,""],
    "js/core/views.js": ["2aee99732cc01597",31332,""],
    "js/dist/company/chunks/exceljs.min-Cd0WKM3n.js": ["f113c5443f0643dc",1394665,"company"],
    "js/dist/company/chunks/xlsx-reader-CPcF3VtK.js": ["2434aeece60d858e",2160,"company"],
    "js/dist/company/company.js": ["73fbabc8785a54ff",1319713,"company"],
    "js/dist/construction-v2.js": ["bd467d9eb8e86e71",333846,"construction-v2"],
    "js/dist/planfact/chunks/exceljs.min-Cd0WKM3n.js": ["f113c5443f0643dc",1394665,"planfact"],
    "js/dist/planfact/chunks/xlsx-reader-CPcF3VtK.js": ["2434aeece60d858e",2160,"planfact"],
    "js/dist/planfact/chunks/xlsx-writer-C1YpHX_s.js": ["70ba43f300adeb4d",12722,"planfact"],
    "js/dist/planfact/planfact.js": ["bb7a0e81a3633b12",1635155,"planfact"],
    "js/dist/platform-admin/platform-admin.js": ["ce93570c6c17f382",26360,"platform-admin"],
    "js/dist/platform/platform.js": ["64671580197a6bb0",721204,""],
    "js/dist/rbi-construction-acceptance.js": ["bc64aaa6db993c9c",14605,"construction"],
    "js/dist/rbi-construction-defects.js": ["234ce71f41917c30",12286,"construction"],
    "js/dist/rbi-construction-units.js": ["24fc5f9644437f65",17075,"construction"],
    "js/dist/rbi-locations.js": ["4fe79f9019eaf31f",31350,""],
    "js/modules/company/company.manifest.js": ["77f1297a0b2364b2",914,""],
    "js/modules/company/index.js": ["25fe815fceceeff5",7030,""],
    "js/modules/construction-v2/construction-v2.manifest.js": ["12b93c40db0f63f2",645,""],
    "js/modules/construction-v2/index.js": ["198cf47ab56aac85",324,"construction-v2"],
    "js/modules/construction/construction.actions.js": ["10009a3972004706",12342,"construction"],
    "js/modules/construction/construction.manifest.js": ["507fea4e9ba2d0a5",969,""],
    "js/modules/construction/construction.module.js": ["3b86612a571cdcef",5915,"construction"],
    "js/modules/construction/construction.render.js": ["732cefbfce2296e5",20841,"construction"],
    "js/modules/construction/construction.state.js": ["9b0d05d63360b127",3540,"construction"],
    "js/modules/construction/features/acceptance.js": ["b822512616fc6f4e",47120,"construction"],
    "js/modules/construction/features/admin.js": ["e43baff0e535b2f9",30306,"construction"],
    "js/modules/construction/features/construction-core.js": ["ecbafd0bf87c2e7e",56558,"construction"],
    "js/modules/construction/features/defect-form.js": ["d939b1d79e9577c4",72387,"construction"],
    "js/modules/construction/features/pdf-viewer.js": ["d7bd77b17bee0dcd",30502,"construction"],
    "js/modules/construction/features/transfer.js": ["7c4b75655054efef",15119,"construction"],
    "js/modules/construction/index.js": ["76cbabf6d244dd21",1011,"construction"],
    "js/modules/knowledge/features/faq.js": ["51389199a8c1217f",79746,""],
    "js/modules/knowledge/features/reference.js": ["4a2c3f253d652920",149480,""],
    "js/modules/knowledge/index.js": ["e78203dbc1c2e34e",828,""],
    "js/modules/knowledge/knowledge.actions.js": ["213a269236ae7f2c",5159,""],
    "js/modules/knowledge/knowledge.desktop.checklists.js": ["f40aa71db8b6263d",25759,""],
    "js/modules/knowledge/knowledge.desktop.docs.js": ["f12137fea411bfbf",27642,""],
    "js/modules/knowledge/knowledge.desktop.nodes.js": ["6bda11a98ca928f5",29425,""],
    "js/modules/knowledge/knowledge.desktop.practices.js": ["afdd33800f70d861",36535,""],
    "js/modules/knowledge/knowledge.desktop.render.js": ["2cb08fc8b81a83d8",19067,""],
    "js/modules/knowledge/knowledge.desktop.twi.js": ["6360631a6a2e57c9",45748,""],
    "js/modules/knowledge/knowledge.manifest.js": ["df7080a9ea3488ee",695,""],
    "js/modules/knowledge/knowledge.module.js": ["f4935a4b51f4022d",275861,""],
    "js/modules/knowledge/knowledge.render.js": ["5ce05b4b1684a07d",28972,""],
    "js/modules/knowledge/knowledge.state.js": ["74b4b8a91892d562",7772,""],
    "js/modules/knowledge/twi.docx-export.js": ["bd5c958a5c92c51a",28903,""],
    "js/modules/modules.manifest.js": ["12bd76b9dd6d6fb7",1998,""],
    "js/modules/planfact/index.js": ["a38744e12f566593",10513,""],
    "js/modules/planfact/planfact.manifest.js": ["2ea520b4a8517be5",3737,""],
    "js/modules/quality/features/ai/ai.actions.js": ["b5df7b5087c13a32",258679,"quality"],
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
    "js/modules/quality/features/analytics/sk.desktop.content.js": ["53c2f39ffbbcf4e4",39931,"quality"],
    "js/modules/quality/features/analytics/sk.issue-rules.js": ["1667be18123016d9",6090,"quality"],
    "js/modules/quality/features/audit/audit.actions.js": ["89caecf5f4189d30",68877,"quality"],
    "js/modules/quality/features/audit/audit.desktop.render.js": ["81ca781e1d4166aa",34050,"quality"],
    "js/modules/quality/features/audit/audit.module.js": ["b40f223385fde235",10888,"quality"],
    "js/modules/quality/features/audit/audit.render.js": ["436eb918334af8f2",76944,"quality"],
    "js/modules/quality/features/audit/audit.state.js": ["09aec5e32b3a2364",6258,"quality"],
    "js/modules/quality/features/audit/features/quality-plan-pin.js": ["dc862cfb99637261",53652,"quality"],
    "js/modules/quality/features/engineer/engineer.actions.js": ["b855da9b0e995dc7",2074,"quality"],
    "js/modules/quality/features/engineer/engineer.desktop.render.js": ["bc3c284c2006e037",100206,"quality"],
    "js/modules/quality/features/engineer/engineer.module.js": ["71277c6c9e68373c",3828,"quality"],
    "js/modules/quality/features/engineer/engineer.render.js": ["7f6acfb8bbe49547",22709,"quality"],
    "js/modules/quality/features/engineer/engineer.state.js": ["98242afc05867caa",2743,"quality"],
    "js/modules/quality/features/etalon/etalon-v18.actions.js": ["c2ad0e195f389bee",45168,"quality"],
    "js/modules/quality/features/etalon/etalon-v18.render.js": ["81ddbe143eb56393",23646,"quality"],
    "js/modules/quality/features/etalon/etalon-v18b.actions.js": ["ef606f5523e64892",26382,"quality"],
    "js/modules/quality/features/etalon/etalon-v18b.frame.html": ["1ebc642c3f63084b",2686189,"quality"],
    "js/modules/quality/features/etalon/etalon-v18b.render.js": ["921f70de19ebd2b8",6028,"quality"],
    "js/modules/quality/features/etalon/etalon.actions.js": ["d7052df91abcb1f0",65885,"quality"],
    "js/modules/quality/features/etalon/etalon.docx-export.js": ["8d3dd5eb9b07a2d6",26727,"quality"],
    "js/modules/quality/features/etalon/etalon.module.js": ["9662330077e6c2e1",5453,"quality"],
    "js/modules/quality/features/etalon/etalon.render.js": ["af07da8d6328129a",11869,"quality"],
    "js/modules/quality/features/etalon/etalon.state.js": ["be5dfad60a12905a",1346,"quality"],
    "js/modules/quality/features/gamification/game.actions.js": ["8c9d1fd067ee006f",176130,"quality"],
    "js/modules/quality/features/gamification/game.manifest.js": ["65d155a74a48f399",1334,""],
    "js/modules/quality/features/gamification/game.module.js": ["f0998764ea971b61",11376,"quality"],
    "js/modules/quality/features/gamification/game.render.js": ["f1e40ec658135959",163760,"quality"],
    "js/modules/quality/features/gamification/game.state.js": ["4e70bb08855ce237",48126,"quality"],
    "js/modules/quality/features/gamification/index.js": ["306c6e40a71a6864",786,"quality"],
    "js/modules/quality/features/history/history.actions.js": ["15545f42e953c9f4",22469,"quality"],
    "js/modules/quality/features/history/history.group.js": ["63f47bd0057e37de",2919,"quality"],
    "js/modules/quality/features/history/history.module.js": ["5278f0b03126f1cf",6352,"quality"],
    "js/modules/quality/features/history/history.render.js": ["aea6acd6dc96caf4",93499,"quality"],
    "js/modules/quality/features/history/history.state.js": ["585494cf9b568f9e",8365,"quality"],
    "js/modules/quality/features/interventions.js": ["3a18905dd4404f87",140843,"quality"],
    "js/modules/quality/features/meetings/meetings.actions.js": ["2397aec3df064b79",4480,"quality"],
    "js/modules/quality/features/meetings/meetings.docx-export.js": ["b834634da2642bba",27877,"quality"],
    "js/modules/quality/features/meetings/meetings.module.js": ["b2ef8f0f4d95d77d",159976,"quality"],
    "js/modules/quality/features/meetings/meetings.protocol.js": ["6c99e6ebe5a6fc82",38462,"quality"],
    "js/modules/quality/features/meetings/meetings.render.js": ["85b90c63d3a2201a",1038,"quality"],
    "js/modules/quality/features/meetings/meetings.state.js": ["488b8898197062ba",1315,"quality"],
    "js/modules/quality/features/practice.pptx-export.js": ["4395bd6801a78f49",15115,"quality"],
    "js/modules/quality/features/reports/report-kind.js": ["2175baa0ade7c514",5539,"quality"],
    "js/modules/quality/features/reports/report-preview.js": ["1daa865ab4fbdecf",8605,"quality"],
    "js/modules/quality/features/reports/reports.actions.js": ["2ff8d9bf31af347b",666539,"quality"],
    "js/modules/quality/features/reports/reports.module.js": ["9c22b9fe41c188bf",7936,"quality"],
    "js/modules/quality/features/reports/reports.pptx-export.js": ["5b235d981ba4a120",59926,"quality"],
    "js/modules/quality/features/reports/reports.pptx-viewer.js": ["e5a9cfd181ea48fc",7963,"quality"],
    "js/modules/quality/features/reports/reports.render.js": ["fa799af0d864f69f",3754,"quality"],
    "js/modules/quality/features/reports/reports.state.js": ["ec8bbf39f57b71fb",2476,"quality"],
    "js/modules/quality/features/schedule/schedule.actions.js": ["aebd982caf78f7ca",15473,"quality"],
    "js/modules/quality/features/schedule/schedule.module.js": ["384974f9f683f6ca",4705,"quality"],
    "js/modules/quality/features/schedule/schedule.render.js": ["174ec6ec605d1fea",27672,"quality"],
    "js/modules/quality/features/schedule/schedule.state.js": ["e8ff731725bdafe4",1303,"quality"],
    "js/modules/quality/features/shared/multi-filter.js": ["1b6fad91b480c5cf",38003,"quality"],
    "js/modules/quality/features/shared/plan-pin-label.js": ["88fa5c5cd50176cc",5904,"quality"],
    "js/modules/quality/features/shared/plan-pin-print.js": ["47b8efae58063d79",5459,"quality"],
    "js/modules/quality/features/sk/index.js": ["14df2a9bdbe9fe9d",758,"quality"],
    "js/modules/quality/features/sk/sk.actions.js": ["ffd279cb12217b2e",83328,"quality"],
    "js/modules/quality/features/sk/sk.manifest.js": ["1dbdccac97d8a1bd",799,""],
    "js/modules/quality/features/sk/sk.module.js": ["e93f986b659e5703",9130,"quality"],
    "js/modules/quality/features/sk/sk.render.js": ["eefc05f6acd9ccfa",105091,"quality"],
    "js/modules/quality/features/sk/sk.state.js": ["2ab85496b502636d",2225,"quality"],
    "js/modules/quality/features/tasks/tasks.actions.js": ["c113212551be6cf7",4792,"quality"],
    "js/modules/quality/features/tasks/tasks.module.js": ["dc61e9d50f20ab64",206016,"quality"],
    "js/modules/quality/features/tasks/tasks.render.js": ["4ee7cd12ca4464a8",2772,"quality"],
    "js/modules/quality/features/tasks/tasks.state.js": ["90d0302ed1b217a0",2707,"quality"],
    "js/modules/quality/index.js": ["9f82720a2feb8972",853,"quality"],
    "js/modules/quality/manifest.js": ["9cbbf460131d1443",1135,""],
    "js/modules/quality/quality.module.js": ["45ddf8533e8d0b82",3257,"quality"],
    "js/modules/settings/features/app-mode-utils.js": ["e093b4ca4b27a65c",89246,""],
    "js/modules/settings/features/changelog.js": ["b1ede15df69b01d6",85281,""],
    "js/modules/settings/features/cloud-deleted-purge-ui.js": ["d23b0fd665ece0f9",29571,""],
    "js/modules/settings/features/cloud-orphan-urls-ui.js": ["d2a18252f782503c",26090,""],
    "js/modules/settings/features/contractor-directory-ui.js": ["7f8665f71dd640c4",28473,""],
    "js/modules/settings/features/contractor-id-backfill-ui.js": ["5c0585b8c9138090",9736,""],
    "js/modules/settings/features/feedback.js": ["4a9e0a2a8333cb25",37481,""],
    "js/modules/settings/features/location-directory-ui.js": ["5f883d9b3bff8e63",30461,""],
    "js/modules/settings/features/official-templates-ui.js": ["bf5ba8e432667382",15730,""],
    "js/modules/settings/features/project-id-backfill-ui.js": ["78965bccc97f4699",12726,""],
    "js/modules/settings/features/role-matrix-ui.js": ["ceb338665df0b4bf",23958,""],
    "js/modules/settings/features/tutorial.js": ["ba71f37c6183ea98",63195,""],
    "js/modules/settings/index.js": ["5c4ef31bcbdc08b5",818,""],
    "js/modules/settings/settings.actions.js": ["afdcf382d60ef440",36326,""],
    "js/modules/settings/settings.desktop.render.js": ["76d739c2d52fa7eb",8464,""],
    "js/modules/settings/settings.manifest.js": ["cb8fb906246cb924",752,""],
    "js/modules/settings/settings.module.js": ["9acc04e635d95ffc",13540,""],
    "js/modules/settings/settings.nav.js": ["ddad8284ba2f443c",14161,""],
    "js/modules/settings/settings.render.js": ["2c74637f110c9e3b",211853,""],
    "js/modules/settings/settings.routes.js": ["03a11c3b25a05c68",6753,""],
    "js/services/ai.service.js": ["81319b59599cf8c6",3352,""],
    "js/services/analytics.service.js": ["c3713abe691ce61d",5827,""],
    "js/services/app-mode.service.js": ["3d18214b2eee6f81",2137,""],
    "js/services/company.service.js": ["4e572853e3816579",15292,""],
    "js/services/config.service.js": ["92754ac47eea9f80",3005,""],
    "js/services/contractor-directory.service.js": ["09c8bb3140a54682",48276,""],
    "js/services/contractor-metrics.service.js": ["a5942bd8380696bc",12817,""],
    "js/services/file.service.js": ["6bfe5ab29d34d8a8",1140,""],
    "js/services/game.service.js": ["e98eb64649a432d6",6020,""],
    "js/services/i18n.service.js": ["0223ca65ea80bda3",5587,""],
    "js/services/inspection.service.js": ["5945dc69447710d1",11723,""],
    "js/services/knowledge.service.js": ["7fd1e9f3a1e0ac03",18125,""],
    "js/services/masterData.service.js": ["d9164c50f3c09dfb",3195,""],
    "js/services/object-directory.service.js": ["2e31ff108a7f1dbc",89272,""],
    "js/services/permission.service.js": ["5ee6222595f89ee9",41820,""],
    "js/services/report.service.js": ["84ec6c874f93a4e3",7011,""],
    "js/services/session.service.js": ["0af7856bf406ff7f",13966,""],
    "js/services/settings.service.js": ["213f2b38598d8329",12339,""],
    "js/services/sk.service.js": ["c8ebaa74585eca76",7319,""],
    "js/services/storage.service.js": ["5cfa40af5599faf1",4362,""],
    "js/services/storage/checklist-snapshot.utils.js": ["7d5230dec8f2d4f1",5441,""],
    "js/services/storage/history-memory.utils.js": ["88b0b2166bb100fc",4583,""],
    "js/services/storage/storage-cache-manager.js": ["5f457a35a20de361",69274,""],
    "js/services/storage/storage-converters.utils.js": ["5b768eb8ecb3da99",6994,""],
    "js/services/storage/storage-db.core.js": ["cb8d5c153815d3aa",42133,""],
    "js/services/storage/storage-diagnostics.render.js": ["768558d07b1973df",11900,""],
    "js/services/storage/storage-file-queue.actions.js": ["d18b5e4affc07d33",35390,""],
    "js/services/storage/storage-offline-cache.utils.js": ["8ba0fa46868584c2",17358,""],
    "js/services/storage/storage-photo-loader.js": ["50e85e40a2287622",12852,""],
    "js/services/storage/storage-photo-manager.js": ["59967b9fafc9a9a6",38296,""],
    "js/services/sync.service.js": ["a1d0efd8d9b20a2c",2859,""],
    "js/services/sync/sync-auth.js": ["d2dfa72b55853417",10971,""],
    "js/services/sync/sync-cloud-prepare.utils.js": ["5d1e40c5615b7aec",26251,""],
    "js/services/sync/sync-connection.actions.js": ["c03e9fb129de969e",33859,""],
    "js/services/sync/sync-core.state.js": ["9de46b270feadea5",22655,""],
    "js/services/sync/sync-engine.core.js": ["68c75cffe554d68f",307753,""],
    "js/services/sync/sync-journal.policy.js": ["1ea3d3c7b4f08140",7669,""],
    "js/services/sync/sync-merge.policy.js": ["c729fbca7501c1c3",7103,""],
    "js/services/sync/sync-net.policy.js": ["8ca918d5aee3540e",9752,""],
    "js/services/sync/sync-post-actions.js": ["454434d09ee9abe9",10633,""],
    "js/services/sync/sync-progress.ui.js": ["4ec0843bd1d3f622",14900,""],
    "js/services/sync/sync-pull.policy.js": ["62b98be9ab852312",12517,""],
    "js/services/sync/sync-push-pull.core.js": ["aeb77793942735cb",26056,""],
    "js/services/sync/sync-retry.policy.js": ["1fd88a0222131c6d",15091,""],
    "js/services/sync/sync-ui.render.js": ["f49203b01796a35c",27126,""],
    "js/services/task.service.js": ["11d44c8e1c004c53",6752,""],
    "js/services/template.service.js": ["b9d302fbf672dfe3",8593,""],
    "js/services/user-context.service.js": ["a7802f0d38615604",2742,""],
    "js/shared/checklist-runner.js": ["016a9bac9031365f",34049,""],
    "js/shared/error-log.utils.js": ["34a211d8496e89fd",2381,""],
    "js/shared/fab-export.utils.js": ["475d6847652a1cd9",16867,""],
    "js/shared/form-draft.utils.js": ["41348b5a3a1b26c5",8810,""],
    "js/shared/layout.utils.js": ["0e92b8b2bffe258c",11640,""],
    "js/shared/math.utils.js": ["a835b3630faca1a1",44209,""],
    "js/shared/notify.utils.js": ["f5dbddfb44217906",5087,""],
    "js/shared/pdf-open.utils.js": ["83840244668684aa",24086,""],
    "js/shared/photo-editor.utils.js": ["658b4356bd1d565e",27484,""],
    "js/shared/photo-viewer-zoom.utils.js": ["0e61ef104ea46f48",7009,""],
    "js/shared/plan-panzoom.utils.js": ["6ee5e0acbc8e06a9",3409,""],
    "js/shared/pwa-update.utils.js": ["5f1e1052298192c1",7828,""],
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
    "libs/pdfjs/pdf.min.js": ["5b5799e6f8c68066",320004,""],
    "libs/pdfjs/pdf.worker.min.js": ["feabdf309770ed24",1087212,""],
    "libs/pptxgenjs.bundle.js": ["4fb9eac5cfefb213",460889,""],
    "libs/pptxviewjs.min.js": ["f38d4b2d5fc4b526",621122,""],
    "libs/qrcode.min.js": ["c541ef06327885a8",19927,""],
    "libs/supabase-js.min.js": ["df19aeb6c97ef48c",200135,""],
    "libs/tailwindcdn.js": ["176e894661aa9cdc",407279,""],
    "libs/xlsx.full.min.js": ["c9506197caf809a0",881727,""],
    "locales/en.json": ["bf4cc44bb9235938",214210,""],
    "locales/ka.json": ["52470991d929ca57",367013,""],
    "locales/ru.json": ["f0d99fdae4dc25e8",280951,""],
    "locales/sr-Latn.json": ["b305155b9b08d456",220306,""],
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

/**
 * Business path prefix → shortId (app.entry allowSet / RBI_SW_ALLOWLIST).
 * Order: longer / more specific prefixes first (construction-v2 before construction).
 * *.manifest.js under these prefixes are NOT gated (declarative glue for modules.manifest.js).
 */
const BUSINESS_PREFIX_TO_MODULE = [
  { prefix: '/js/modules/construction-v2/', module: 'construction-v2' },
  { prefix: '/js/modules/construction/', module: 'construction' },
  { prefix: '/js/modules/quality/', module: 'quality' },
  { prefix: '/js/dist/construction-v2.js', module: 'construction-v2' },
  { prefix: '/js/dist/rbi-construction-', module: 'construction' }
];

/** null = allowlist ещё не пришёл — временно разрешаем cache.put (первый paint). */
let allowedModules = null;

/**
 * P2-0013: бандлы модулей Platform 2.0 — в кэше только положенные этому входу (сообщение P2_SW_ALLOWLIST от входа платформы:
 * модуль компании ∩ права по ответу сервера); остальные не кэшируются и удаляются. Сам вход (js/dist/platform/) — всем.
 */
const P2_PREFIX_TO_MODULE = [
  { prefix: '/js/dist/planfact/', module: 'planfact' },
  { prefix: '/js/dist/company/', module: 'company' },
  { prefix: '/js/dist/platform-admin/', module: 'platform-admin' }
];
let p2AllowedModules = null;

function resolveP2Module(url) {
  try {
    const path = new URL(url).pathname;
    for (let i = 0; i < P2_PREFIX_TO_MODULE.length; i++) {
      if (path.indexOf(P2_PREFIX_TO_MODULE[i].prefix) !== -1) return P2_PREFIX_TO_MODULE[i].module;
    }
  } catch (e) { /* ignore */ }
  return null;
}

function purgeDisallowedP2Cache() {
  if (p2AllowedModules === null) return Promise.resolve();
  return caches.open(CACHE_NAME).then((cache) => cache.keys().then((keys) => Promise.all(keys.map((req) => {
    const mod = resolveP2Module(req.url);
    return mod && p2AllowedModules.indexOf(mod) === -1 ? cache.delete(req) : null;
  }))));
}

function isManifestUrl(url) {
  try {
    const path = new URL(url).pathname;
    return /(^|\/)[^/]*manifest\.js$/.test(path);
  } catch (e) {
    return false;
  }
}

function resolveBusinessModule(url) {
  try {
    const path = new URL(url).pathname;
    for (let i = 0; i < BUSINESS_PREFIX_TO_MODULE.length; i++) {
      const { prefix, module } = BUSINESS_PREFIX_TO_MODULE[i];
      if (prefix.endsWith('.js')) {
        if (path === prefix || path.endsWith(prefix)) return module;
      } else if (path.indexOf(prefix) !== -1) {
        return module;
      }
    }
  } catch (e) { /* ignore */ }
  return null;
}

function mayCachePut(url) {
  const p2 = resolveP2Module(url);
  if (p2) return p2AllowedModules === null || p2AllowedModules.indexOf(p2) !== -1;
  if (isManifestUrl(url)) return true;
  const mod = resolveBusinessModule(url);
  if (!mod) return true;
  if (allowedModules === null) return true;
  return allowedModules.indexOf(mod) !== -1;
}

function purgeDisallowedBusinessCache() {
  if (allowedModules === null) return Promise.resolve();
  return caches.open(CACHE_NAME).then((cache) => {
    return cache.keys().then((keys) => {
      return Promise.all(
        keys.map((req) => {
          if (isManifestUrl(req.url)) return null;
          const mod = resolveBusinessModule(req.url);
          if (mod && allowedModules.indexOf(mod) === -1) {
            return cache.delete(req);
          }
          return null;
        })
      );
    });
  });
}

// 1. ПРЕ-КЭШ: shell + settings + locations (+ business *.manifest.js as declarations).
// Business bundles (quality/construction/…) — runtime cache via fetch + RBI_SW_ALLOWLIST.
const urlsToCache = [
  './',
  './index.html',
  './report.html',
  './css/brand/rbi.css',
  './css/style.css',
  './css/app-shell.desktop.css',
  './css/rbi-ui.css',
  './css/analytics.desktop.css',
  './css/audit.desktop.css',
  './css/engineer.desktop.css',
  './css/knowledge.desktop.css',
  './css/settings.desktop.css',
  // PWA / сплэш / push (иначе офлайн без иконок и «Добавить на экран»)
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-2.png',
  './icons/icon-maskable-512.png',
  './data/system_docs.js',
  './data/system_nodes.js',
  './data/system_twi.js',
  './js/shared/template.utils.js',
  './data/system_templates.js',
  './data/system_templates.en.js',
  './data/system_templates.sr-Latn.js',
  './data/system_templates.ka.js',
  './js/shared/system-templates-locale.js',
  './js/core/router.js',
  './js/core/views.js',
  './js/services/config.service.js',
  './libs/tailwindcdn.js',
  './libs/chart.umd.min.js',
  './libs/xlsx.full.min.js',
  './libs/html2pdf.bundle.min.js',
  './libs/pptxgenjs.bundle.js',
  './libs/pptxviewjs.min.js',
  './libs/docx.bundle.js',
  './libs/pdfjs/pdf.min.js',
  './libs/pdfjs/pdf.worker.min.js',
  './libs/qrcode.min.js',
  './libs/panzoom.min.js',
  './libs/Sortable.min.js',
  './libs/supabase-js.min.js',
  './js/services/sync/sync-pull.policy.js',
  './js/services/sync/sync-retry.policy.js',
  './js/services/sync/sync-net.policy.js',
  './js/services/sync/sync-journal.policy.js',
  './js/services/sync/sync-merge.policy.js',
  './js/services/sync/sync-core.state.js',
  './js/services/sync/sync-cloud-prepare.utils.js',
  './js/services/sync/sync-auth.js',
  './js/services/sync/sync-ui.render.js',
  './js/services/sync/sync-connection.actions.js',
  './js/services/sync/sync-push-pull.core.js',
  './js/services/sync/sync-progress.ui.js',
  './js/services/sync/sync-engine.core.js',
  './js/services/sync/sync-post-actions.js',
  './js/services/storage/storage-db.core.js',
  './js/services/storage/checklist-snapshot.utils.js',
  './js/services/storage/history-memory.utils.js',
  './js/services/storage/storage-converters.utils.js',
  './js/services/storage/storage-cache-manager.js',
  './js/services/storage/storage-offline-cache.utils.js',
  './js/services/storage/storage-diagnostics.render.js',
  './js/services/storage/storage-photo-loader.js',
  './js/services/storage/storage-photo-manager.js',
  './js/services/storage/storage-file-queue.actions.js',
  './js/shared/math.utils.js',
  './js/shared/plan-panzoom.utils.js',
  './js/shared/toast.utils.js',
  './js/shared/form-draft.utils.js',
  './js/shared/smart-input.utils.js',
  './js/shared/photo-editor.utils.js',
  './js/shared/photo-viewer-zoom.utils.js',
  './js/shared/pdf-open.utils.js',
  './js/shared/theme.utils.js',
  './js/shared/splash-screen.utils.js',
  './js/shared/pwa-update.utils.js',
  './js/shared/fab-export.utils.js',
  './js/shared/layout.utils.js',
  './js/shared/sync-ui-defer.utils.js',
  './js/shared/notify.utils.js',
  './js/shared/error-log.utils.js',
  './js/shared/touch-gestures.utils.js',
  './js/shared/ui-motion.utils.js',
  './js/shared/snake-game.utils.js',
  './js/shared/checklist-runner.js',
  './js/core/bootstrap.js',
  './js/core/app-shell.js',
  './js/core/app-shell.desktop.js',

  // Ядро модульной архитектуры
  './js/core/rbi-core.js',
  './js/core/app.entry.js',
  './js/core/module-loader.js',
  './js/modules/modules.manifest.js',

  // Сервисы
  './js/services/storage.service.js',
  './js/services/permission.service.js',
  './js/services/sync.service.js',
  './js/services/inspection.service.js',
  './js/services/file.service.js',
  './js/services/report.service.js',
  './js/services/contractor-directory.service.js',
  './js/services/contractor-metrics.service.js',
  './js/services/object-directory.service.js',
  './js/services/task.service.js',
  './js/services/sk.service.js',
  './js/services/game.service.js',
  './js/services/knowledge.service.js',
  './js/services/analytics.service.js',

  // Фаза 21 — AI Service
  './js/services/ai.service.js',

  // Фаза 22/23 — Master Data Service
  './js/services/masterData.service.js',

  // Фаза 29 — Template Service
  './js/services/template.service.js',

  // Фаза 8 — Settings
  './js/services/settings.service.js',
  // i18n v1 — каркас локализации оболочки
  './js/services/i18n.service.js',
  './locales/ru.json',
  './locales/en.json',
  './locales/sr-Latn.json',
  './locales/ka.json',
  './js/services/app-mode.service.js',
  './js/services/company.service.js',
  './js/services/user-context.service.js',
  './js/services/session.service.js',
  './js/modules/settings/settings.manifest.js',
  './js/modules/settings/settings.routes.js',
  './js/modules/settings/settings.nav.js',
  './js/modules/settings/settings.render.js',
  './js/modules/settings/settings.desktop.render.js',
  './js/modules/settings/settings.actions.js',
  './js/modules/settings/settings.module.js',
  './js/modules/settings/features/tutorial.js',
  './js/modules/settings/features/app-mode-utils.js',
  './js/modules/settings/features/changelog.js',
  './js/modules/settings/features/feedback.js',
  './js/modules/settings/features/contractor-directory-ui.js',
  './js/modules/settings/features/contractor-id-backfill-ui.js',
  './js/modules/settings/features/project-id-backfill-ui.js',
  './js/modules/settings/features/cloud-deleted-purge-ui.js',
  './js/modules/settings/features/cloud-orphan-urls-ui.js',
  './js/modules/settings/features/role-matrix-ui.js',
  './js/modules/settings/features/official-templates-ui.js',
  './js/modules/settings/features/location-directory-ui.js',
  './js/modules/settings/index.js',
  './js/dist/rbi-locations.js',

  // Business manifests only (declarative; modules.manifest.js imports them)
  './js/modules/quality/manifest.js',
  './js/modules/quality/features/sk/sk.manifest.js',
  './js/modules/knowledge/knowledge.manifest.js',
  './js/modules/quality/features/gamification/game.manifest.js',
  './js/modules/quality/features/ai/ai.manifest.js',
  './js/modules/construction/construction.manifest.js',
  './js/modules/construction-v2/construction-v2.manifest.js',

  // Модули (legacy)
  './manifest.webmanifest',
  // Шрифты Inter (интерфейс)
  './fonts/Inter-Regular.woff2',
  './fonts/Inter-Medium.woff2',
  './fonts/Inter-SemiBold.woff2',
  './fonts/Inter-Bold.woff2',
  './fonts/Inter-ExtraBold.woff2',
  './fonts/Inter-Black.woff2',

  // Шрифты IBM Plex Sans (темы rbi-*-v3)
  './fonts/IBMPlexSans-Regular.woff2',
  './fonts/IBMPlexSans-Medium.woff2',
  './fonts/IBMPlexSans-SemiBold.woff2',
  './fonts/IBMPlexSans-Bold.woff2',

  // Шрифты Playfair Display (PDF – заголовки)
  './fonts/PlayfairDisplay-Regular.woff2',
  './fonts/PlayfairDisplay-Italic.woff2',
  './fonts/PlayfairDisplay-Medium.woff2',
  './fonts/PlayfairDisplay-MediumItalic.woff2',
  './fonts/PlayfairDisplay-SemiBold.woff2',
  './fonts/PlayfairDisplay-SemiBoldItalic.woff2',
  './fonts/PlayfairDisplay-Bold.woff2',
  './fonts/PlayfairDisplay-BoldItalic.woff2',
  './fonts/PlayfairDisplay-ExtraBold.woff2',
  './fonts/PlayfairDisplay-ExtraBoldItalic.woff2',
  './fonts/PlayfairDisplay-Black.woff2',
  './fonts/PlayfairDisplay-BlackItalic.woff2',

  // Шрифты Bricolage Grotesque (PDF – основной текст)
  './fonts/BricolageGrotesque-Light.woff2',
  './fonts/BricolageGrotesque-Regular.woff2',
  './fonts/BricolageGrotesque-Medium.woff2',
  './fonts/BricolageGrotesque-SemiBold.woff2',
  './fonts/BricolageGrotesque-Bold.woff2',
  './fonts/BricolageGrotesque-ExtraBold.woff2'
];

// 2. УСТАНОВКА: Безопасное скачивание файлов в память
// skipWaiting: только первая установка (нет active SW). Обновление ждёт
// кнопку «Обновить» → postMessage('SKIP_WAITING'), иначе controllerchange
// + location.reload на iPhone выглядят как внезапная перезагрузка.
self.addEventListener('install', event => {
  const legacyAtStart = hasLegacyCache();   // P2-0032: до скачивания — пока кэш старого приложения на месте
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('[SW] Кэшируем ядро и библиотеки...');
      // Безопасное кэширование: если одна ссылка недоступна, остальные всё равно скачаются
      return Promise.all(

        urlsToCache.map(url => {

          // cache: 'reload' — принудительно обходит HTTP-кэш браузера (критично для
          // iOS Safari: без этого fetch() мог вернуть старую версию файла из
          // собственного кэша WebKit, даже если Cache API уже создаёт новую версию
          // кэша под новым CACHE_NAME — из-за этого получалась смесь старых и новых
          // файлов внутри "новой" версии и визуальные артефакты после обновления).
          return fetch(url, { cache: 'reload' })

            .then(response => {

              if (
                response &&
                response.status === 200
              ) {

                return cache.put(
                  url,
                  response.clone()
                );

              }

            })

            .catch(err => {

              console.log(
                '[SW] Ошибка кэширования:',
                url,
                err
              );

            });

        })

      );
    }).then(() => Promise.all([legacyAtStart, hasLegacyCache()])).then(([a, b]) => a || b).then((legacy) => {
      // P2-0032: поверх старого приложения РБИ — сразу (его страница не знает новых файлов и может зависнуть)
      if (!self.registration.active || legacy) {
        return self.skipWaiting();
      }
    })
  );
});

// 3. АКТИВАЦИЯ: Удаляем старые версии кэша
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      const legacy = cacheNames.some((n) => n.startsWith(LEGACY_CACHE_PREFIX));
      return Promise.all(
        cacheNames.map(cacheName => {
          // Platform 2.0: удаляем свои старые кэши и кэш старого приложения РБИ (P2-0032); прочие не трогаем
          if ((cacheName.startsWith(CACHE_PREFIX) && cacheName !== CACHE_NAME) || cacheName.startsWith(LEGACY_CACHE_PREFIX)) {
            console.log('[SW] Удаляем старый кэш:', cacheName);
            return caches.delete(cacheName);
          }
        })
      ).then(() => self.clients.claim()).then(() => {
        if (!legacy) return;
        // окна, открытые старым приложением (или зависшие на смеси старых и новых файлов), — перезагрузить один раз
        return self.clients.matchAll({ type: 'window' }).then((list) => Promise.all(list.map((c) =>
          typeof c.navigate === 'function' ? c.navigate(c.url).catch(() => null) : null)));
      });
    })
  );
});

// 4. ПЕРЕХВАТ ЗАПРОСОВ
// P2-0016 (ADR-068): файлы компаний — в закрытых бакетах quality-*. Ссылки в записях Качества остаются «публичного» вида
// (…/object/public/quality-…); кэш приложения подставляет вход вошедшего (токен присылает страница — сообщение P2_STORAGE_TOKEN)
// и берёт файл по …/object/authenticated/…. Только сервер платформы (APP_CONFIG.P2_SUPABASE_URL). Нет связи — офлайн-кэш.
let p2StorageToken = null;
let p2TokenKnown = false;   // страница уже сообщила (в т.ч. «вышли» — null): не ждать
let p2TokenWaiters = [];
const P2_STORAGE_ORIGIN = (() => { try { return new URL(self.APP_CONFIG.P2_SUPABASE_URL).origin; } catch (e) { return ''; } })();

function isCompanyFileUrl(url) {
  return !!P2_STORAGE_ORIGIN && url.startsWith(P2_STORAGE_ORIGIN + '/storage/v1/object/public/quality-');
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

  // ✅ НОВОЕ: Полностью пропускаем запросы к облачному хранилищу (Storage)
  if (event.request.url.includes('/storage/v1/object/public/')) {
    return;   // Браузер обработает запрос напрямую, без вмешательства SW
  }

  // ✅ Пропускаем запросы к API Supabase (база, авторизация, функции) по пути, без привязки к хосту
  const isApi = /\/(rest|auth|functions|realtime)\/v1\//.test(event.request.url);
  if (isApi) return;

  // P2-0032: только свой кэш — caches.match искал бы и в кэше старого приложения РБИ (смесь старых и новых файлов)
  event.respondWith(
    caches.open(CACHE_NAME).then((c) => c.match(event.request)).then((cachedResponse) => {
      // Сеть (обновление кэша) запускаем всегда, но НЕ ждём её для ответа,
      // если есть кэш — см. ветку ниже. .catch(() => null) не даёт упасть
      // необработанным réjection'ом (сеть недоступна/CORS).
      // P2-0032: с перепроверкой у сервера (ответ «не изменилось» дешёвый). Сервер не отдаёт Cache-Control для js/css —
      // без этого браузер брал из своего кэша старый файл прежнего приложения (с тем же путём) рядом с новыми.
      const netInit = event.request.mode === 'navigate' ? undefined : { cache: 'no-cache' };
      const networkUpdate = fetch(event.request, netInit).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && mayCachePut(event.request.url)) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      }).catch(() => null);

      // Cache-first + stale-while-revalidate: если есть закэшированная
      // версия — отдаём её МГНОВЕННО, не дожидаясь сети. Раньше здесь был
      // network-first (сначала fetch, кэш — только при явном сетевом
      // сбое) — на iOS при смене сети на возврате из фона fetch() может
      // «висеть» без явного reject, и запрос ядра приложения (bootstrap.js,
      // router.js и т.п.) зависал вместо мгновенной отдачи из кэша. Плюс
      // раньше не-200 ответ сети (гонка деплоя/CDN) шёл пользователю
      // напрямую, даже если в кэше была валидная версия. Сеть обновляет
      // кэш в фоне (event.waitUntil — чтобы браузер не убил SW раньше
      // времени), результат уйдёт в дело при следующем обращении.
      if (cachedResponse) {
        event.waitUntil(networkUpdate);
        return cachedResponse;
      }

      // В кэше нет записи — сеть остаётся единственным источником.
      return networkUpdate.then((networkResponse) => networkResponse || Response.error());
    }).catch(() => Response.error())
  );
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
    icon: './icons/icon-512-2.png',
    badge: './icons/icon-512-2.png',
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
    event.waitUntil(purgeDisallowedBusinessCache());
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
    event.waitUntil(purgeDisallowedP2Cache());
  }
});