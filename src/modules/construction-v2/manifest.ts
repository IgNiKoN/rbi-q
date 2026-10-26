export const ConstructionV2Manifest = {
  id: 'construction-v2',
  role: 'module' as const,
  title: 'Стройконтроль (новый)',
  icon: 'hard-hat',
  version: '0.1.0',
  status: 'active' as const,
  entry: './index.js',
  menu: { section: 'construction', label: 'СК (новый)', order: 11 },
  company: { enabledByDefault: true },
  routes: ['/construction-v2', '/construction-v2/:subTab'],
  defaultRoute: '/construction-v2'
};
