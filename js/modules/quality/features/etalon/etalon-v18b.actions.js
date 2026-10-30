// etalon-v18b.actions.js — «Акт-Эталон (Бета 2, только ПК)»: точная (1:1) копия
// исходного Шаблон_акта_эталона_в_18.html — внешний вид, справка (RU/EN/SR),
// one-pager с картинкой, форма печати — без изменений, через <iframe>.
// Отличие от etalon-v18.actions.js (Блок 2, мобильно-адаптированный конструктор):
// здесь оригинальный файл встраивается целиком, платформа только обменивается
// данными с ним через postMessage и сохраняет их в тот же стор rbi_etalon_acts
// (source_kind = 'act_v18b'). Доступно только на ПК (ширина >= 768px) —
// оригинальная вёрстка рассчитана на десктоп и печать A4, на телефоне неприменима.
(function () {
  'use strict';

  var DEVIATIONS_DEFAULT_RU = 'Отклонений не выявлено';
  var REMARKS_REF_RU = 'См. раздел «Замечания и корректировки»';

  function _t(key, fallback, vars) {
    try {
      var i18n = window.RBI && window.RBI.services && window.RBI.services.i18n;
      if (i18n && typeof i18n.t === 'function') {
        var s = vars ? i18n.t(key, vars) : i18n.t(key);
        if (s && s !== key) return s;
      }
    } catch (e) {}
    if (vars && fallback) {
      return String(fallback).replace(/\{(\w+)\}/g, function (_m, k) {
        return vars[k] != null ? String(vars[k]) : '';
      });
    }
    return fallback;
  }

  var FRAME_SRC = './js/modules/quality/features/etalon/etalon-v18b.frame.html';
  var _v18b = {
    editingId: null,
    frameReady: false,
    pendingPrefill: null,
    pendingDraftPrefill: null,
    lastBridgeSnapshot: null,
    draftPollTimer: null,
    openContext: { project: '', contractor: '', templateKey: '' }
  };
  function _storage() {
    if (window.RBI && window.RBI.services && window.RBI.services.storage) {
      return window.RBI.services.storage;
    }
    return {
      stores: function () { return typeof STORES !== 'undefined' ? STORES : {}; },
      put: function (store, data) { return dbPut(store, data); }
    };
  }
  function _triggerSync(mode) {
    if (window.RBI && window.RBI.services && window.RBI.services.sync) return window.RBI.services.sync.trigger(mode || 'silent');
    if (typeof triggerSync === 'function') return triggerSync(mode || 'silent');
    return Promise.resolve(false);
  }

  function _etalonActs() {
    if (window.RBI && window.RBI.services && window.RBI.services.knowledge && typeof window.RBI.services.knowledge.ensureEtalonActsSync === 'function') {
      return window.RBI.services.knowledge.ensureEtalonActsSync();
    }
    if (!Array.isArray(window.etalonActsArray)) window.etalonActsArray = [];
    return window.etalonActsArray;
  }

  function _isDesktop() {
    return window.innerWidth >= 768;
  }

  function _frame() {
    return document.getElementById('etv18b-frame');
  }

  function _postToFrame(type, payload) {
    var frame = _frame();
    if (!frame || !frame.contentWindow) return;
    frame.contentWindow.postMessage({ target: 'rbi-etalon-v18b', type: type, payload: payload }, '*');
  }

  // Преобразует хранимую в акте модель (record.details.actV18b) в плоский
  // набор data-field полей + структурированные таблицы для префилла iframe.
  function _buildPrefillFromRecord(record) {
    var a = (record && record.details && record.details.actV18b) || {};
    var h = a.header || {};
    return {
      fields: {
        typeSmr: !!h.typeSmr,
        typeProduct: !!h.typeProduct,
        typeNode: !!h.typeNode,
        typeFinish: !!h.typeFinish,
        typeOther: !!h.typeOther,
        typeOtherText: h.typeOtherText || '',
        object: h.object || '',
        address: h.address || '',
        name: h.name || '',
        location: h.location || '',
        inspectionDate: h.inspectionDate || '',
        sampleComposition: (a.scope || {}).sampleComposition || '',
        applicationZone: (a.scope || {}).applicationZone || '',
        sampleSize: (a.scope || {}).sampleSize || '',
        notIncluded: (a.scope || {}).notIncluded || '',
        decisionAccepted: (a.decision || {}).result === 'accepted',
        decisionConditional: (a.decision || {}).result === 'conditional',
        decisionRejected: (a.decision || {}).result === 'rejected',
        sampleStored: (a.decision || {}).storage === 'stored',
        sampleRemoved: (a.decision || {}).storage === 'removed',
        sampleConcealed: (a.decision || {}).storage === 'concealed',
        storagePlace: (a.decision || {}).storagePlace || '',
        photoObject: h.object || '',
        photoName: h.name || ''
      },
      onePager: a.onePager || { html: '', hasFile: false },
      language: a.language || 'ru',
      photos: (a.photos || []).map(function (p) { return { photo: p._displayUrl || p.photo || '', desc: p.desc || '', date: p.date || '' }; }),
      participants: a.participants || [],
      controls: a.controls || [],
      tables: a.tables || {}
    };
  }

  async function _hydratePhotoDisplayUrls(a) {
    var photos = (a && a.photos) || [];
    for (var i = 0; i < photos.length; i++) {
      var p = photos[i];
      if (p.photo && String(p.photo).indexOf('local://') === 0) {
        p._displayUrl = await PhotoManager.getAsyncUrl(p.photo) || window.getPhotoSrc(p.photo);
      } else {
        p._displayUrl = p.photo;
      }
    }
  }

  // Загружает data-URL фото из iframe (base64) в PhotoManager и заменяет
  // на local:// id — как во всей остальной платформе, ничего не пишем
  // напрямую в IndexedDB как base64.
  async function _persistPhotosFromBridge(photos) {
    var result = [];
    for (var i = 0; i < (photos || []).length; i++) {
      var p = photos[i];
      var photoRef = p.photo || '';
      if (photoRef && photoRef.indexOf('data:') === 0) {
        photoRef = await PhotoManager.saveLocal(photoRef, 'etalon_v18b');
      }
      result.push({ photo: photoRef, desc: p.desc || '', date: p.date || '' });
    }
    return result;
  }

  function _bridgeHasContent(bridge) {
    if (!bridge) return false;
    var fields = bridge.fields || {};
    if ((fields.location || '').trim()) return true;
    if ((fields.object || '').trim()) return true;
    if ((fields.address || '').trim()) return true;
    if ((fields.name || '').trim()) return true;
    if ((fields.inspectionDate || '').trim()) return true;
    if ((fields.typeOtherText || '').trim()) return true;
    if ((fields.sampleComposition || '').trim()) return true;
    if ((fields.applicationZone || '').trim()) return true;
    if ((fields.sampleSize || '').trim()) return true;
    if ((fields.notIncluded || '').trim()) return true;
    if ((fields.storagePlace || '').trim()) return true;
    if (fields.typeSmr || fields.typeProduct || fields.typeNode || fields.typeFinish || fields.typeOther) return true;
    if (fields.decisionAccepted || fields.decisionConditional || fields.decisionRejected) return true;
    if (fields.sampleStored || fields.sampleRemoved || fields.sampleConcealed) return true;
    if (bridge.onePager && bridge.onePager.hasFile) return true;
    if (Array.isArray(bridge.photos) && bridge.photos.some(function (p) { return (p.photo || p.desc); })) return true;
    if (Array.isArray(bridge.participants) && bridge.participants.some(function (p) {
      return (p.organization || p.position || p.name);
    })) return true;
    if (Array.isArray(bridge.controls) && bridge.controls.length) return true;
    var tables = bridge.tables || {};
    var tableKeys = Object.keys(tables);
    for (var i = 0; i < tableKeys.length; i++) {
      var rows = tables[tableKeys[i]];
      if (Array.isArray(rows) && rows.length) return true;
    }
    return false;
  }

  function _stopDraftPolling() {
    if (_v18b.draftPollTimer) {
      clearInterval(_v18b.draftPollTimer);
      _v18b.draftPollTimer = null;
    }
  }

  function _startDraftPolling() {
    _stopDraftPolling();
    if (_v18b.editingId) return;
    _v18b.draftPollTimer = setInterval(function () {
      if (_v18b.frameReady && !_v18b.editingId) _postToFrame('collect-draft', null);
    }, 2000);
  }

  var EtalonV18BActions = {

    _getShellRemountState: function () {
      return {
        project: document.getElementById('etv18b-project') ? document.getElementById('etv18b-project').value : '',
        contractor: document.getElementById('etv18b-contractor') ? document.getElementById('etv18b-contractor').value : '',
        templateKey: document.getElementById('etv18b-template') ? document.getElementById('etv18b-template').value : '',
        title: document.getElementById('etv18b-title-text') ? document.getElementById('etv18b-title-text').innerText : ''
      };
    },

    _applyShellRemountState: function (state) {
      if (!state) return;
      this._populateTemplateSelect(state.templateKey || _v18b.openContext.templateKey || '');
      if (state.project != null && document.getElementById('etv18b-project')) document.getElementById('etv18b-project').value = state.project;
      if (state.contractor != null && document.getElementById('etv18b-contractor')) document.getElementById('etv18b-contractor').value = state.contractor;
      if (state.templateKey && document.getElementById('etv18b-template')) document.getElementById('etv18b-template').value = state.templateKey;
      var titleEl = document.getElementById('etv18b-title-text');
      if (titleEl) {
        if (state.title) {
          titleEl.innerText = state.title;
        } else if (state.project) {
          titleEl.innerText = _t('quality.etalon.v18b.title_with_project', 'Акт-Эталон (Бета 2, ПК) — {project}', { project: state.project });
        }
      }
    },

    _populateTemplateSelect: function (selectedKey) {
      var tmplSelect = document.getElementById('etv18b-template');
      if (!tmplSelect) return;
      var tmplOpts = '<option value="" disabled selected>' + _t('quality.etalon.select.template', '-- Выберите вид работ --') + '</option>';
      var tmplSvc = (window.RBI && window.RBI.services && window.RBI.services.templates) ? window.RBI.services.templates : null;
      var st = tmplSvc ? tmplSvc.getSystemTemplates() : (typeof window.SYSTEM_TEMPLATES !== 'undefined' ? window.SYSTEM_TEMPLATES : {});
      var sysKeys = Object.keys(st).sort(function (a, b) { return st[a].title.localeCompare(st[b].title); });
      sysKeys.forEach(function (k) { tmplOpts += '<option value="sys_' + k + '">[' + _t('quality.etalon.tag.system', 'СИС') + '] ' + st[k].title + '</option>'; });
      var ut = tmplSvc ? tmplSvc.getUserTemplates() : (typeof window.userTemplates !== 'undefined' ? window.userTemplates : {});
      if (ut && typeof ut === 'object') {
        var userKeys = Object.keys(ut).filter(function (k) {
          return ut[k] && !ut[k]._deleted && !ut[k].is_deleted;
        }).sort(function (a, b) { return (ut[a].title || '').localeCompare(ut[b].title || '', 'ru'); });
        userKeys.forEach(function (k) { tmplOpts += '<option value="user_' + k + '">[' + _t('quality.etalon.tag.user', 'МОЙ') + '] ' + ut[k].title + '</option>'; });
      }
      tmplSelect.innerHTML = tmplOpts;
      if (selectedKey) tmplSelect.value = selectedKey;
    },

    _collectShellDraft: function () {
      if (_v18b.editingId || window._rbiEtalonV18BSkipDraft) return null;
      var projectEl = document.getElementById('etv18b-project');
      var contractorEl = document.getElementById('etv18b-contractor');
      var templateEl = document.getElementById('etv18b-template');
      var project = projectEl ? projectEl.value : '';
      var contractor = contractorEl ? contractorEl.value : '';
      var templateKey = templateEl ? templateEl.value : '';
      var bridge = _v18b.lastBridgeSnapshot || null;
      var ctx = _v18b.openContext || {};
      var shellChanged = !!(
        (project && project !== (ctx.project || '')) ||
        (contractor && contractor !== (ctx.contractor || '')) ||
        (templateKey && templateKey !== (ctx.templateKey || ''))
      );
      if (!shellChanged && !_bridgeHasContent(bridge)) return null;
      return { project: project, contractor: contractor, templateKey: templateKey, bridge: bridge };
    },

    onDraftSnapshot: function (payload) {
      _v18b.lastBridgeSnapshot = payload || null;
      // iframe не в DOM родителя — bindAutoSave shell не ловит правки акта;
      // пишем черновик по каждому snapshot (debounce внутри FormDraft.scheduleSave).
      if (!_v18b.editingId && !window._rbiEtalonV18BSkipDraft && window.RBIFormDraft) {
        window.RBIFormDraft.scheduleSave(window.RBIFormDraft.KEYS.ETALON_V18B, function () {
          return EtalonV18BActions._collectShellDraft();
        });
      }
    },

    /**
     * Открывает полноэкранный просмотр с iframe-конструктором (только ПК).
     * @param {Object} prefill — { contractor, templateKey, templateTitle, projectName }
     */
    openConstructor: function (prefill) {
      if (!_isDesktop()) {
        showToast(_t('quality.etalon.v18b.toast.desktop_only', '⚠️ «Акт-Эталон (Бета 2)» доступен только на ПК (ширина экрана ≥ 768px)'));
        return;
      }
      var p = prefill || {};
      var skipDraft = !!window._rbiEtalonV18BSkipDraft;
      window._rbiEtalonV18BSkipDraft = false;
      if (!skipDraft) _v18b.editingId = null;
      _stopDraftPolling();
      _v18b = {
        editingId: _v18b.editingId,
        frameReady: false,
        pendingPrefill: null,
        pendingDraftPrefill: null,
        lastBridgeSnapshot: null,
        draftPollTimer: null,
        openContext: { project: '', contractor: '', templateKey: '' }
      };

      var FD = window.RBIFormDraft;
      if (FD) FD.unbindAutoSave(FD.KEYS.ETALON_V18B);

      if (window.EtalonV18BRender) window.EtalonV18BRender.mount(FRAME_SRC);

      var inpProject = document.getElementById('inp-project');
      document.getElementById('etv18b-project').value = p.projectName || (inpProject ? inpProject.value : '') || '';
      document.getElementById('etv18b-contractor').value = p.contractor || '';

      var tmplSelect = document.getElementById('etv18b-template');
      EtalonV18BActions._populateTemplateSelect(p.templateKey || '');

      if (typeof initSmartInput === 'function') {
        initSmartInput('etv18b-project', 'projectName');
        initSmartInput('etv18b-contractor', 'contractorName');
      }

      var titleEl = document.getElementById('etv18b-title-text');
      if (titleEl) titleEl.innerText = _t('quality.etalon.v18b.title_with_project', 'Акт-Эталон (Бета 2, ПК) — {project}', { project: p.projectName || _t('quality.etalon.title.new_act_short', 'Новый Акт') });

      _v18b.openContext = {
        project: p.projectName || (inpProject ? inpProject.value : '') || '',
        contractor: p.contractor || '',
        templateKey: p.templateKey || ''
      };

      var view = document.getElementById('etalon-v18b-view');
      if (view) {
        view.classList.remove('hidden');
        document.body.classList.add('modal-open');
      }

      if (!skipDraft && FD) {
        var decision = FD.askRestore(FD.KEYS.ETALON_V18B, _t('quality.etalon.v18b.title', 'Акт-Эталон (Бета 2, ПК)'));
        if (decision === 'continue') {
          var d = FD.get(FD.KEYS.ETALON_V18B);
          if (d && d.payload) {
            if (d.payload.project != null) document.getElementById('etv18b-project').value = d.payload.project;
            if (d.payload.contractor != null) document.getElementById('etv18b-contractor').value = d.payload.contractor;
            if (d.payload.templateKey) tmplSelect.value = d.payload.templateKey;
            if (d.payload.bridge) _v18b.pendingDraftPrefill = d.payload.bridge;
          }
        }
        FD.bindAutoSave(view, FD.KEYS.ETALON_V18B, function () {
          return EtalonV18BActions._collectShellDraft();
        });
      }
    },

    closeConstructor: function () {
      var FD = window.RBIFormDraft;
      if (FD) FD.unbindAutoSave(FD.KEYS.ETALON_V18B);
      _stopDraftPolling();
      if (!_v18b.editingId && !window._rbiEtalonV18BSkipDraftSave && FD) {
        _postToFrame('collect-draft', null);
        FD.saveNow(FD.KEYS.ETALON_V18B, function () { return EtalonV18BActions._collectShellDraft(); });
      }
      var view = document.getElementById('etalon-v18b-view');
      if (view) view.classList.add('hidden');
      document.body.classList.remove('modal-open');
      var host = document.getElementById('etv18b-frame-host');
      if (host) host.innerHTML = '';
      _v18b.frameReady = false;
    },

    /**
     * Загружает существующий акт act_v18b для редактирования.
     */
    editAct: async function (id) {
      if (!_isDesktop()) {
        showToast(_t('quality.etalon.v18b.toast.desktop_only', '⚠️ «Акт-Эталон (Бета 2)» доступен только на ПК (ширина экрана ≥ 768px)'));
        return;
      }
      var record = _etalonActs().find(function (a) { return String(a.id) === String(id); });
      if (!record || !record.details || !record.details.actV18b) return showToast(_t('quality.etalon.v18b.toast.not_found', '❌ Акт не найден'));

      window._rbiEtalonV18BSkipDraft = true;
      EtalonV18BActions.openConstructor({
        projectName: record.projectName,
        contractor: record.contractorName,
        templateKey: record.templateKey,
        templateTitle: record.templateTitle
      });
      _v18b.editingId = id;

      var a = record.details.actV18b;
      await _hydratePhotoDisplayUrls(a);
      _v18b.pendingPrefill = _buildPrefillFromRecord(record);

      // Если iframe уже прислал frame-ready — префилл применяется немедленно,
      // иначе он ждётся в обработчике onFrameMessage (см. render.js#_bindFrameMessages).
      if (_v18b.frameReady) {
        _postToFrame('prefill', _v18b.pendingPrefill);
        _v18b.pendingPrefill = null;
      }

      var titleEl = document.getElementById('etv18b-title-text');
      if (titleEl) titleEl.innerText = _t('quality.etalon.v18b.title_with_details', 'Акт-Эталон (Бета 2, ПК) — {project} | {contractor}', { project: record.projectName, contractor: record.contractorName });
    },

    /**
     * Вызывается при получении frame-ready — применяет отложенный префилл
     * (см. editAct) и помечает мост готовым к сохранению.
     */
    onFrameReady: function () {
      _v18b.frameReady = true;
      if (_v18b.pendingPrefill) {
        _postToFrame('prefill', _v18b.pendingPrefill);
        _v18b.pendingPrefill = null;
      } else if (_v18b.pendingDraftPrefill) {
        _postToFrame('prefill', _v18b.pendingDraftPrefill);
        _v18b.pendingDraftPrefill = null;
      }
      if (!_v18b.editingId) _startDraftPolling();
    },

    /**
     * Обрабатывает данные, присланные iframe при клике «Сохранить в RBI».
     * @param {Object} data — collectBridgeData() из etalon-v18b.frame.html
     * @param {Boolean} closeAfter
     */
    onSaveRequest: async function (data, closeAfter) {
      var selProject = document.getElementById('etv18b-project').value.trim();
      var selContractor = document.getElementById('etv18b-contractor').value.trim();
      var selTemplateKey = document.getElementById('etv18b-template').value;
      var tmplSelect = document.getElementById('etv18b-template');
      var selectedOption = tmplSelect.options[tmplSelect.selectedIndex];
      var selTemplateTitle = selectedOption ? selectedOption.text.replace(/\[.*?\]\s*/, '') : '';
      var fields = data.fields || {};
      var location = fields.location || '';

      if (!selProject || !selContractor || !selTemplateKey) return showToast(_t('quality.etalon.v18b.toast.required_shell', '⚠️ Укажите Объект, Подрядчика и Вид работ в верхней панели!'));
      if (!location) return showToast(_t('quality.etalon.v18b.toast.required_location', '⚠️ Заполните «Место устройства / установки» в разделе акта!'));

      showToast(_t('quality.etalon.toast.saving_photo', '⚙️ Сохранение фото...'));
      var photos = await _persistPhotosFromBridge(data.photos);

      var actV18b = {
        header: {
          typeSmr: !!fields.typeSmr,
          typeProduct: !!fields.typeProduct,
          typeNode: !!fields.typeNode,
          typeFinish: !!fields.typeFinish,
          typeOther: !!fields.typeOther,
          typeOtherText: fields.typeOtherText || '',
          object: fields.object || '',
          address: fields.address || '',
          name: fields.name || '',
          location: location,
          inspectionDate: fields.inspectionDate || ''
        },
        participants: data.participants || [],
        scope: {
          sampleComposition: fields.sampleComposition || '',
          applicationZone: fields.applicationZone || '',
          sampleSize: fields.sampleSize || '',
          notIncluded: fields.notIncluded || ''
        },
        tables: data.tables || {},
        controls: data.controls || [],
        decision: {
          result: fields.decisionAccepted ? 'accepted' : (fields.decisionConditional ? 'conditional' : (fields.decisionRejected ? 'rejected' : '')),
          storage: fields.sampleStored ? 'stored' : (fields.sampleRemoved ? 'removed' : (fields.sampleConcealed ? 'concealed' : '')),
          storagePlace: fields.storagePlace || ''
        },
        onePager: data.onePager || { html: '', hasFile: false },
        language: data.language || 'ru',
        photos: photos
      };

      var etalonId = _v18b.editingId || window.RbiIds.newId();
      var myName = 'Инженер';
      if (window.RBI && window.RBI.services && window.RBI.services.settings) {
        myName = window.RBI.services.settings.get('engineerName') || myName;
      }

      var participantsSummary = (actV18b.participants || []).map(function (p) {
        return p.organization + (p.position ? ', ' + p.position : '') + (p.name ? ' — ' + p.name : '');
      }).join('; ');

      var record = {
        id: etalonId,
        owner: myName,
        date: new Date().toISOString(),
        projectName: selProject,
        inspectorName: myName,
        contractorName: selContractor,
        templateKey: selTemplateKey,
        templateTitle: selTemplateTitle,
        location: location,
        instanceId: 'etalon',
        stageId: 0,
        stageName: 'Акт-Эталон (Бета 2, ПК)',
        checkedStagesInfo: ['Фиксация эталона (полная копия конструктора v18, ПК)'],
        isCompleted: true,
        state: { '9901': 'ok' },
        photos: {},
        source_kind: 'act_v18b',
        details: {
          participants: participantsSummary,
          deviations: (actV18b.tables && actV18b.tables.remarksTable && actV18b.tables.remarksTable.length) ? REMARKS_REF_RU : DEVIATIONS_DEFAULT_RU,
          elements: [], // Совместимость со старым просмотрщиком/печатью (см. printEtalon) — пусто для act_v18b.
          actV18b: actV18b
        },
        metrics: { final: 100, baseUrkPerc: 100, checkedCount: 1, totalCount: 1, n_B1_fail: 0, n_B2_fail: 0, n_B3_fail: 0, kc: 1, kcrit: 1, statusTxt: 'ЭТАЛОН', statusCls: 'tag-blue' },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        source: 'local',
        syncStatus: 'not_synced',
        sync_status: 'not_synced',
        syncBlockReason: '',
        sync_block_reason: '',
        is_deleted: false,
        _deleted: false
      };

      var acts = _etalonActs();
      var idx = acts.findIndex(function (a) { return String(a.id) === String(etalonId); });
      if (idx !== -1) {
        record.createdAt = acts[idx].createdAt || record.createdAt;
        acts[idx] = record;
      } else {
        acts.push(record);
      }

      await _storage().put(_storage().stores().ETALON_ACTS, record);
      _v18b.editingId = etalonId;
      showToast(_t('quality.etalon.v18b.toast.saved', '✅ Акт-Эталон (Бета 2) успешно сохранён!'));
      localStorage.setItem('rbi_cloud_dirty', '1');
      setTimeout(function () { _triggerSync('silent'); }, 800);

      window._rbiEtalonV18BSkipDraftSave = true;
      if (window.RBIFormDraft) {
        window.RBIFormDraft.clear(window.RBIFormDraft.KEYS.ETALON_V18B);
        window.RBIFormDraft.unbindAutoSave(window.RBIFormDraft.KEYS.ETALON_V18B);
      }
      _stopDraftPolling();

      if (closeAfter) {
        EtalonV18BActions.closeConstructor();
      }
      window._rbiEtalonV18BSkipDraftSave = false;
      if (window.RBIFormDraft) window.RBIFormDraft.clear(window.RBIFormDraft.KEYS.ETALON_V18B);

      setTimeout(function () {
        if (typeof rbi_renderPracticesTab === 'function') rbi_renderPracticesTab();
        if (typeof renderHistoryTab === 'function') renderHistoryTab();
      }, 200);

      document.dispatchEvent(new CustomEvent('etalon:act:saved', { detail: { id: record.id, printAfter: false, sourceKind: 'act_v18b' } }));
    }
  };

  window.EtalonV18BActions = EtalonV18BActions;
  window.openEtalonV18BConstructor = EtalonV18BActions.openConstructor.bind(EtalonV18BActions);
  window.closeEtalonV18BConstructor = EtalonV18BActions.closeConstructor.bind(EtalonV18BActions);
  window.editEtalonV18BAct = EtalonV18BActions.editAct.bind(EtalonV18BActions);

  console.log('[EtalonV18BActions] etalon-v18b.actions.js loaded');
}());
