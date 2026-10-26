// === AI State — Фаза 19 ===
// Изолированное состояние AI-модуля.
// Экспортируется через ES export; публикацию в window.AIState для legacy-кода
// делает ai.module.js (entry).

function _getSetting(key) {
  return ((AIState._ctx && AIState._ctx.settings) || window.RBI.services.settings).get(key);
}

const AIState = {
    _ctx: null,
    bindCtx(ctx) { this._ctx = ctx; },
    _isEnabled: false,
    _authMode: 'account',
    _isProcessing: false,
    _lastError: null,

    /** Живая ссылка на флаг из appSettings */
    isEnabled() {
      return !!_getSetting('aiEnabled');
    },

    /** Режим ИИ: 'personal' (свой ключ) или 'account' (по учётке; старые 'role'/'corporate' — тоже по учётке, P2-0034) */
    getAuthMode() {
      return _getSetting('aiAuthMode') === 'personal' ? 'personal' : 'account';
    },

    isProcessing() {
      return this._isProcessing;
    },

    setProcessing(v) {
      this._isProcessing = !!v;
    },

    /** Снимает текущие значения из appSettings → внутренние поля */
    syncFromLegacy() {
      this._isEnabled = !!_getSetting('aiEnabled');
      this._authMode = this.getAuthMode();
    }
};

export { AIState };
