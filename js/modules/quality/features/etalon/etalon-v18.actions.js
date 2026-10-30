// etalon-v18.actions.js — «Акт-Эталон (Бета)»: структурированный конструктор
// на основе Шаблон_акта_эталона_в_18.html (11 разделов юридического акта
// согласования, вместо упрощённой модели elements[] из etalon.actions.js).
//
// Данные хранятся в том же сторе rbi_etalon_acts, что и обычный Акт-Эталон,
// с меткой record.source_kind = 'act_v18' и details.actV18 = { ...11 разделов }.
// Синхронизация, список в библиотеке, автозакрытие задач — переиспользуются
// без изменений (см. etalon.actions.js#saveAct для сравнения).

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

  function _storage() {
    if (window.RBI && window.RBI.services && window.RBI.services.storage) {
      return window.RBI.services.storage;
    }
    return {
      stores: function () { return typeof STORES !== 'undefined' ? STORES : {}; },
      get: function (store, key) { return dbGet(store, key); },
      getAll: function (store) { return dbGetAll(store); },
      put: function (store, data) { return dbPut(store, data); },
      delete: function (store, key) { return dbDelete(store, key); }
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

  function _templates() {
    if (window.RBI && window.RBI.services && window.RBI.services.templates) {
      return window.RBI.services.templates;
    }
    return {
      getUserTemplates: function () { return typeof window.userTemplates !== 'undefined' ? window.userTemplates : {}; },
      getSystemTemplates: function () { return typeof window.SYSTEM_TEMPLATES !== 'undefined' ? window.SYSTEM_TEMPLATES : {}; }
    };
  }

  function _escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>]/g, function (m) {
      if (m === '&') return '&amp;';
      if (m === '<') return '&lt;';
      if (m === '>') return '&gt;';
      return m;
    });
  }

  // Определение полей таблиц по разделам акта (для generic add/remove/collect).
  var ROW_FIELDS = {
    documentsTable: ['doc', 'designation'],
    solutionsTable: ['element', 'solution'],
    materialsTable: ['name', 'mark', 'manufacturer', 'qualityDoc', 'color'],
    testsTable: ['type', 'method', 'result'],
    remarksTable: ['remark', 'responsible', 'deadline', 'closure'],
    attachmentsTable: ['name', 'qty', 'note']
  };

  var ROW_PLACEHOLDERS = {
    documentsTable: [
      _t('quality.etalon.v18.ph.document', 'например: рабочая документация раздела АР'),
      _t('quality.etalon.v18.ph.designation', 'например: АР-15, лист 24 от 01.07.2026')
    ],
    solutionsTable: [
      _t('quality.etalon.v18.ph.solution_element', 'например: угловой стык стеклопакетов'),
      _t('quality.etalon.v18.ph.solution_value', 'например: согласованный внешний вид, конструкция и последовательность')
    ],
    materialsTable: [
      _t('quality.etalon.v18.ph.material_name', 'например: стеклопакет'),
      _t('quality.etalon.v18.ph.material_mark', 'например: СПД 6Зак-16Ar-6'),
      _t('quality.etalon.v18.ph.manufacturer', 'например: ООО «Производитель»'),
      _t('quality.etalon.v18.ph.quality_doc', 'например: паспорт № 125'),
      _t('quality.etalon.v18.ph.color', 'например: прозрачный, RAL 9005')
    ],
    testsTable: [
      _t('quality.etalon.v18.ph.test_type', 'например: проверка герметичности'),
      _t('quality.etalon.v18.ph.method', 'например: пролив водой 15 минут'),
      _t('quality.etalon.v18.ph.test_result', 'например: протечек нет, протокол № 5')
    ],
    remarksTable: [
      _t('quality.etalon.v18.ph.remark', 'например: выровнять вертикальный шов'),
      _t('quality.etalon.v18.ph.responsible', 'например: ООО «Подрядчик»'),
      _t('quality.etalon.v18.ph.deadline', 'например: до 20.07.2026'),
      _t('quality.etalon.v18.ph.closure', 'например: устранено 19.07.2026')
    ],
    attachmentsTable: [
      _t('quality.etalon.v18.ph.attachment_name', 'например: дополнительный чертёж узла'),
      _t('quality.etalon.v18.ph.qty', 'например: 2 листа / 4 файла'),
      _t('quality.etalon.v18.ph.note', 'например: в электронном виде')
    ]
  };

  // Приватное состояние конструктора (аналог _context в etalon.actions.js).
  var _v18 = {
    editingId: null,
    photos: [] // { desc, date, photo (local:// id via PhotoManager) }
  };
  var _v18OpenContext = { projectName: '', contractor: '', templateKey: '' };

  function _draftNowV18() {
    if (!window.RBIFormDraft || _v18.editingId) return;
    window.RBIFormDraft.saveNow(window.RBIFormDraft.KEYS.ETALON_V18, function () {
      return EtalonV18Actions._collectNewDraft();
    });
  }

  function _row(tableId, values) {
    var fields = ROW_FIELDS[tableId];
    var cells = fields.map(function (f, i) {
      var ph = (ROW_PLACEHOLDERS[tableId] && ROW_PLACEHOLDERS[tableId][i]) || '';
      var val = (values && values[f]) || '';
      return '<td contenteditable="true" data-row-field="' + f + '" data-placeholder="' + _escapeHtml(ph) + '">' + _escapeHtml(val) + '</td>';
    }).join('');
    return '<tr><td class="etv18-rownum center text-rbi-caption font-bold text-muted px-2 py-2 text-center w-8"></td>' + cells + '</tr>';
  }

  function _renumberTable(tableId) {
    var tbody = document.querySelector('#' + tableId + ' tbody');
    if (!tbody) return;
    Array.prototype.forEach.call(tbody.rows, function (row, idx) {
      var numCell = row.querySelector('.etv18-rownum');
      if (numCell) numCell.textContent = idx + 1;
    });
  }

  function _addRow(tableId, values) {
    var tbody = document.querySelector('#' + tableId + ' tbody');
    if (!tbody) return;
    tbody.insertAdjacentHTML('beforeend', _row(tableId, values));
    _renumberTable(tableId);
  }

  function _removeLastRow(tableId) {
    var tbody = document.querySelector('#' + tableId + ' tbody');
    if (!tbody || !tbody.rows.length) return;
    tbody.deleteRow(tbody.rows.length - 1);
  }

  function _collectRows(tableId) {
    var fields = ROW_FIELDS[tableId];
    var tbody = document.querySelector('#' + tableId + ' tbody');
    if (!tbody) return [];
    return Array.prototype.map.call(tbody.rows, function (row) {
      var obj = {};
      fields.forEach(function (f) {
        var cell = row.querySelector('[data-row-field="' + f + '"]');
        obj[f] = cell ? cell.textContent.trim() : '';
      });
      return obj;
    }).filter(function (o) { return Object.keys(o).some(function (k) { return o[k]; }); });
  }

  // ── Участники (переиспользует паттерн из шаблона v18: 3 колонки) ──
  function _participantRow(values) {
    var v = values || {};
    return '<tr>' +
      '<td class="etv18-rownum center text-rbi-caption font-bold text-muted px-2 py-2 text-center w-8"></td>' +
      '<td contenteditable="true" data-p-field="organization" data-placeholder="' + _escapeHtml(_t('quality.etalon.v18.ph.participant_org', 'например: ООО «Заказчик»')) + '">' + _escapeHtml(v.organization) + '</td>' +
      '<td contenteditable="true" data-p-field="position" data-placeholder="' + _escapeHtml(_t('quality.etalon.v18.ph.participant_position', 'например: руководитель проекта')) + '">' + _escapeHtml(v.position) + '</td>' +
      '<td contenteditable="true" data-p-field="name" data-placeholder="' + _escapeHtml(_t('quality.etalon.v18.ph.participant_name', 'например: Иванов И.И.')) + '">' + _escapeHtml(v.name) + '</td>' +
      '</tr>';
  }

  function _addParticipantRow(values) {
    var tbody = document.querySelector('#etv18-participantsTable tbody');
    if (!tbody) return;
    tbody.insertAdjacentHTML('beforeend', _participantRow(values));
    _renumberTable('etv18-participantsTable');
  }

  function _removeLastParticipantRow() {
    var tbody = document.querySelector('#etv18-participantsTable tbody');
    if (!tbody || !tbody.rows.length) return;
    tbody.deleteRow(tbody.rows.length - 1);
  }

  function _collectParticipants() {
    var tbody = document.querySelector('#etv18-participantsTable tbody');
    if (!tbody) return [];
    return Array.prototype.map.call(tbody.rows, function (row) {
      var orgCell = row.querySelector('[data-p-field="organization"]');
      var posCell = row.querySelector('[data-p-field="position"]');
      var nameCell = row.querySelector('[data-p-field="name"]');
      return {
        organization: orgCell ? orgCell.textContent.trim() : '',
        position: posCell ? posCell.textContent.trim() : '',
        name: nameCell ? nameCell.textContent.trim() : ''
      };
    }).filter(function (p) { return p.organization || p.position || p.name; });
  }

  // ── Контрольные параметры (доп. колонка "Соответствие": да/нет/н·п) ──
  function _controlRow(values) {
    var v = values || {};
    var group = 'etv18_control_' + Date.now() + '_' + Math.floor(Math.random() * 10000);
    function radio(val, label) {
      var checked = v.compliance === val ? 'checked' : '';
      return '<label class="inline-flex items-center gap-1 text-rbi-caption"><input type="radio" name="' + group + '" value="' + val + '" ' + checked + '> ' + label + '</label>';
    }
    return '<tr>' +
      '<td class="etv18-rownum center text-rbi-caption font-bold text-muted px-2 py-2 text-center w-8"></td>' +
      '<td contenteditable="true" data-row-field="criterion" data-placeholder="' + _escapeHtml(_t('quality.etalon.v18.ph.criterion', 'например: ширина герметизирующего шва')) + '">' + _escapeHtml(v.criterion) + '</td>' +
      '<td contenteditable="true" data-row-field="basis" data-placeholder="' + _escapeHtml(_t('quality.etalon.v18.ph.basis', 'например: ГОСТ, СП, РД, пункт')) + '">' + _escapeHtml(v.basis) + '</td>' +
      '<td contenteditable="true" data-row-field="requirement" data-placeholder="' + _escapeHtml(_t('quality.etalon.v18.ph.requirement', 'например: 15 ± 2 мм')) + '">' + _escapeHtml(v.requirement) + '</td>' +
      '<td contenteditable="true" data-row-field="actual" data-placeholder="' + _escapeHtml(_t('quality.etalon.v18.ph.actual', 'например: 14 мм')) + '">' + _escapeHtml(v.actual) + '</td>' +
      '<td class="etv18-compliance flex flex-col gap-0.5 px-1 py-1">' + radio('yes', _t('quality.etalon.v18.compliance.yes', 'да')) + radio('no', _t('quality.etalon.v18.compliance.no', 'нет')) + radio('na', _t('quality.etalon.v18.compliance.na', 'н/п')) + '</td>' +
      '</tr>';
  }

  function _addControlRow(values) {
    var tbody = document.querySelector('#etv18-controlTable tbody');
    if (!tbody) return;
    tbody.insertAdjacentHTML('beforeend', _controlRow(values));
    _renumberTable('etv18-controlTable');
  }

  function _removeLastControlRow() {
    var tbody = document.querySelector('#etv18-controlTable tbody');
    if (!tbody || !tbody.rows.length) return;
    tbody.deleteRow(tbody.rows.length - 1);
  }

  function _collectControls() {
    var tbody = document.querySelector('#etv18-controlTable tbody');
    if (!tbody) return [];
    return Array.prototype.map.call(tbody.rows, function (row) {
      var checkedRadio = row.querySelector('input[type="radio"]:checked');
      var criterionCell = row.querySelector('[data-row-field="criterion"]');
      var basisCell = row.querySelector('[data-row-field="basis"]');
      var requirementCell = row.querySelector('[data-row-field="requirement"]');
      var actualCell = row.querySelector('[data-row-field="actual"]');
      return {
        criterion: criterionCell ? criterionCell.textContent.trim() : '',
        basis: basisCell ? basisCell.textContent.trim() : '',
        requirement: requirementCell ? requirementCell.textContent.trim() : '',
        actual: actualCell ? actualCell.textContent.trim() : '',
        compliance: checkedRadio ? checkedRadio.value : ''
      };
    }).filter(function (c) { return c.criterion || c.basis || c.requirement || c.actual; });
  }

  // ── Фото ──
  function _renderPhotoCard(idx, photo) {
    var p = photo || {};
    return '' +
      '<div class="bg-surface border border-surface rounded-xl p-3 shadow-sm relative mb-3" data-photo-idx="' + idx + '">' +
      '<button onclick="window.rbi_etalonV18RemovePhoto(' + idx + ')" class="absolute top-2 right-2 text-danger active:scale-90 font-black text-sm px-2">✕</button>' +
      '<div class="font-black text-rbi-caption text-brand uppercase tracking-widest mb-2">' + _t('quality.etalon.v18.label.photo_card', 'Фото {num}', { num: idx + 1 }) + '</div>' +
      '<div class="etv18-photo-preview" data-idx="' + idx + '">' +
      (p._displayUrl
        ? '<img src="' + p._displayUrl + '" class="w-full h-40 object-contain rounded-lg border border-surface bg-surface cursor-pointer" onclick="openPhotoViewer(\'' + p.photo + '\')">'
        : '<button onclick="document.getElementById(\'etv18-photo-input-' + idx + '\').click()" class="w-full bg-surface text-muted py-3 rounded-lg border border-dashed border-surface font-bold text-rbi-caption uppercase active:scale-95 transition-colors flex items-center justify-center gap-2">📸 ' + _t('quality.etalon.btn.attach_photo', 'Прикрепить фото узла') + '</button>') +
      '</div>' +
      '<input type="file" id="etv18-photo-input-' + idx + '" accept="image/*" class="hidden" onchange="window.rbi_etalonV18UploadPhoto(event, ' + idx + ')">' +
      '<input type="text" class="input-base text-rbi-label mt-2" placeholder="' + _escapeHtml(_t('quality.etalon.v18.placeholder.photo_desc', 'Описание / контролируемый элемент')) + '" value="' + _escapeHtml(p.desc) + '" oninput="window.rbi_etalonV18UpdatePhotoDesc(' + idx + ', this.value)">' +
      '</div>';
  }

  function _renderPhotoGrid() {
    var grid = document.getElementById('etv18-photo-grid');
    if (!grid) return;
    grid.innerHTML = _v18.photos.map(function (p, idx) { return _renderPhotoCard(idx, p); }).join('');
  }

  async function _hydratePhotoPreviews() {
    for (var i = 0; i < _v18.photos.length; i++) {
      var p = _v18.photos[i];
      if (p.photo && !p._displayUrl) {
        p._displayUrl = await PhotoManager.getAsyncUrl(p.photo) || window.getPhotoSrc(p.photo);
      }
    }
    _renderPhotoGrid();
  }

  // ── Раздел 9: решение комиссии / сохранность эталона ──
  function _collectDecision() {
    var decisionRadio = document.querySelector('input[name="etv18-decision"]:checked');
    var storageRadio = document.querySelector('input[name="etv18-storage"]:checked');
    var storagePlaceEl = document.getElementById('etv18-storage-place');
    return {
      result: decisionRadio ? decisionRadio.value : '',
      storage: storageRadio ? storageRadio.value : '',
      storagePlace: storagePlaceEl ? storagePlaceEl.value : ''
    };
  }

  var EtalonV18Actions = {

    _getEditingId: function () { return _v18.editingId; },

    _getOpenContext: function () {
      return {
        projectName: _v18OpenContext.projectName,
        contractor: _v18OpenContext.contractor,
        templateKey: _v18OpenContext.templateKey
      };
    },

    _collectNewDraft: function () {
      if (_v18.editingId || window._rbiEtalonV18SkipDraft) return null;

      var inpProject = document.getElementById('inp-project');
      var defaultProject = _v18OpenContext.projectName || (inpProject ? inpProject.value : '') || '';
      var defaultContractor = _v18OpenContext.contractor || '';
      var defaultTemplateKey = _v18OpenContext.templateKey || '';

      var participants = _collectParticipants();
      var photos = _v18.photos.map(function (p) {
        return { desc: p.desc || '', date: p.date || '', photo: p.photo || '' };
      }).filter(function (p) { return p.photo || p.desc; });

      var payload = {
        project: document.getElementById('etv18-project') ? document.getElementById('etv18-project').value : '',
        contractor: document.getElementById('etv18-contractor') ? document.getElementById('etv18-contractor').value : '',
        templateKey: document.getElementById('etv18-template') ? document.getElementById('etv18-template').value : '',
        header: {
          typeSmr: document.getElementById('etv18-type-smr') ? document.getElementById('etv18-type-smr').checked : false,
          typeProduct: document.getElementById('etv18-type-product') ? document.getElementById('etv18-type-product').checked : false,
          typeNode: document.getElementById('etv18-type-node') ? document.getElementById('etv18-type-node').checked : false,
          typeFinish: document.getElementById('etv18-type-finish') ? document.getElementById('etv18-type-finish').checked : false,
          typeOther: document.getElementById('etv18-type-other') ? document.getElementById('etv18-type-other').checked : false,
          typeOtherText: document.getElementById('etv18-type-other-text') ? document.getElementById('etv18-type-other-text').value.trim() : '',
          object: document.getElementById('etv18-object') ? document.getElementById('etv18-object').value.trim() : '',
          address: document.getElementById('etv18-address') ? document.getElementById('etv18-address').value.trim() : '',
          name: document.getElementById('etv18-name') ? document.getElementById('etv18-name').value.trim() : '',
          location: document.getElementById('etv18-location') ? document.getElementById('etv18-location').value.trim() : '',
          inspectionDate: document.getElementById('etv18-inspection-date') ? document.getElementById('etv18-inspection-date').value : ''
        },
        participants: participants,
        scope: {
          sampleComposition: document.getElementById('etv18-sampleComposition') ? document.getElementById('etv18-sampleComposition').value.trim() : '',
          applicationZone: document.getElementById('etv18-applicationZone') ? document.getElementById('etv18-applicationZone').value.trim() : '',
          sampleSize: document.getElementById('etv18-sampleSize') ? document.getElementById('etv18-sampleSize').value.trim() : '',
          notIncluded: document.getElementById('etv18-notIncluded') ? document.getElementById('etv18-notIncluded').value.trim() : ''
        },
        documents: _collectRows('documentsTable'),
        solutions: _collectRows('solutionsTable'),
        materials: _collectRows('materialsTable'),
        controls: _collectControls(),
        tests: _collectRows('testsTable'),
        remarks: _collectRows('remarksTable'),
        decision: _collectDecision(),
        attachments: _collectRows('attachmentsTable'),
        photos: photos
      };

      var inpInspector = document.getElementById('inp-inspector');
      var defaultInspector = inpInspector ? inpInspector.value.trim() : '';
      var onlyDefaultParticipant = participants.length === 1 &&
        !participants[0].organization &&
        !participants[0].position &&
        (participants[0].name || '').trim() === defaultInspector;

      var header = payload.header || {};
      var scope = payload.scope || {};
      var decision = payload.decision || {};
      var meaningful = !!(
        (header.location || '').trim() ||
        (header.object || '').trim() ||
        (header.address || '').trim() ||
        (header.name || '').trim() ||
        (header.inspectionDate || '').trim() ||
        header.typeSmr || header.typeProduct || header.typeNode || header.typeFinish || header.typeOther ||
        (header.typeOtherText || '').trim() ||
        !onlyDefaultParticipant ||
        (scope.sampleComposition || '').trim() ||
        (scope.applicationZone || '').trim() ||
        (scope.sampleSize || '').trim() ||
        (scope.notIncluded || '').trim() ||
        payload.documents.length ||
        payload.solutions.length ||
        payload.materials.length ||
        payload.controls.length ||
        payload.tests.length ||
        payload.remarks.length ||
        payload.attachments.length ||
        photos.length ||
        (decision.result || '').trim() ||
        (decision.storage || '').trim() ||
        (decision.storagePlace || '').trim() ||
        (payload.project && payload.project !== defaultProject) ||
        (payload.contractor && payload.contractor !== defaultContractor) ||
        (payload.templateKey && payload.templateKey !== defaultTemplateKey)
      );

      return meaningful ? payload : null;
    },

    _applyNewDraft: async function (draftPayload) {
      if (!draftPayload) return;
      var p = draftPayload;

      if (p.project != null) document.getElementById('etv18-project').value = p.project;
      if (p.contractor != null) document.getElementById('etv18-contractor').value = p.contractor;
      if (p.templateKey) {
        var tmplSelect = document.getElementById('etv18-template');
        if (tmplSelect) tmplSelect.value = p.templateKey;
      }

      var h = p.header || {};
      document.getElementById('etv18-type-smr').checked = !!h.typeSmr;
      document.getElementById('etv18-type-product').checked = !!h.typeProduct;
      document.getElementById('etv18-type-node').checked = !!h.typeNode;
      document.getElementById('etv18-type-finish').checked = !!h.typeFinish;
      document.getElementById('etv18-type-other').checked = !!h.typeOther;
      document.getElementById('etv18-type-other-text').value = h.typeOtherText || '';
      document.getElementById('etv18-object').value = h.object || '';
      document.getElementById('etv18-address').value = h.address || '';
      document.getElementById('etv18-name').value = h.name || '';
      document.getElementById('etv18-location').value = h.location || '';
      document.getElementById('etv18-inspection-date').value = h.inspectionDate || '';

      var partTbody = document.querySelector('#etv18-participantsTable tbody');
      if (partTbody) partTbody.innerHTML = '';
      (p.participants || []).forEach(function (part) { _addParticipantRow(part); });
      if (!p.participants || !p.participants.length) {
        var inpInspector = document.getElementById('inp-inspector');
        _addParticipantRow({ name: inpInspector ? inpInspector.value : '' });
      }

      var scope = p.scope || {};
      document.getElementById('etv18-sampleComposition').value = scope.sampleComposition || '';
      document.getElementById('etv18-applicationZone').value = scope.applicationZone || '';
      document.getElementById('etv18-sampleSize').value = scope.sampleSize || '';
      document.getElementById('etv18-notIncluded').value = scope.notIncluded || '';

      function fillRows(tableId, rows) {
        var tbody = document.querySelector('#' + tableId + ' tbody');
        if (tbody) tbody.innerHTML = '';
        (rows || []).forEach(function (r) { _addRow(tableId, r); });
        if (!rows || !rows.length) _addRow(tableId);
      }
      fillRows('documentsTable', p.documents);
      fillRows('solutionsTable', p.solutions);
      fillRows('materialsTable', p.materials);
      fillRows('testsTable', p.tests);
      fillRows('remarksTable', p.remarks);
      fillRows('attachmentsTable', p.attachments);

      var ctrlTbody = document.querySelector('#etv18-controlTable tbody');
      if (ctrlTbody) ctrlTbody.innerHTML = '';
      (p.controls || []).forEach(function (c) { _addControlRow(c); });
      if (!p.controls || !p.controls.length) _addControlRow();

      var decision = p.decision || {};
      if (decision.result) {
        var decisionRadio = document.querySelector('input[name="etv18-decision"][value="' + decision.result + '"]');
        if (decisionRadio) decisionRadio.checked = true;
      }
      if (decision.storage) {
        var storageRadio = document.querySelector('input[name="etv18-storage"][value="' + decision.storage + '"]');
        if (storageRadio) storageRadio.checked = true;
      }
      document.getElementById('etv18-storage-place').value = decision.storagePlace || '';

      _v18.photos = (p.photos || []).map(function (photo) {
        return { desc: photo.desc || '', date: photo.date || '', photo: photo.photo || '' };
      });
      await _hydratePhotoPreviews();
    },

    /**
     * Открывает полноэкранный конструктор Акта-Эталона (Бета).
     * @param {Object} prefill — { contractor, templateKey, templateTitle, projectName, statusKey }
     */
    openConstructor: function (prefill) {
      var p = prefill || {};
      var skipDraft = !!window._rbiEtalonV18SkipDraft;
      window._rbiEtalonV18SkipDraft = false;
      if (!skipDraft) _v18.editingId = null;
      _v18 = { editingId: _v18.editingId, photos: [] };

      var FD = window.RBIFormDraft;
      if (FD) FD.unbindAutoSave(FD.KEYS.ETALON_V18);

      if (window.EtalonV18Render) window.EtalonV18Render.mount();

      var inpProject = document.getElementById('inp-project');
      document.getElementById('etv18-project').value = p.projectName || (inpProject ? inpProject.value : '') || '';
      document.getElementById('etv18-contractor').value = p.contractor || '';

      var tmplSelect = document.getElementById('etv18-template');
      var tmplOpts = '<option value="" disabled selected>' + _t('quality.etalon.select.template', '-- Выберите вид работ --') + '</option>';
      var st = _templates().getSystemTemplates();
      var sysKeys = Object.keys(st).sort(function (a, b) { return st[a].title.localeCompare(st[b].title); });
      sysKeys.forEach(function (k) { tmplOpts += '<option value="sys_' + k + '">[' + _t('quality.etalon.tag.system', 'СИС') + '] ' + st[k].title + '</option>'; });
      var ut = _templates().getUserTemplates();
      if (Object.keys(ut).length > 0) {
        var userKeys = Object.keys(ut).sort(function (a, b) { return ut[a].title.localeCompare(ut[b].title); });
        userKeys.forEach(function (k) { tmplOpts += '<option value="user_' + k + '">[' + _t('quality.etalon.tag.user', 'МОЙ') + '] ' + ut[k].title + '</option>'; });
      }
      tmplSelect.innerHTML = tmplOpts;
      if (p.templateKey) tmplSelect.value = p.templateKey;

      if (typeof initSmartInput === 'function') {
        initSmartInput('etv18-project', 'projectName');
        initSmartInput('etv18-contractor', 'contractorName');
      }

      document.getElementById('etv18-location').value = '';
      document.getElementById('etv18-object').value = p.projectName || '';
      document.getElementById('etv18-name').value = '';
      document.getElementById('etv18-address').value = '';
      document.getElementById('etv18-inspection-date').value = '';

      // Сброс всех табличных разделов к одной пустой строке.
      ['documentsTable', 'solutionsTable', 'materialsTable', 'testsTable', 'remarksTable', 'attachmentsTable'].forEach(function (t) {
        var tbody = document.querySelector('#' + t + ' tbody');
        if (tbody) tbody.innerHTML = '';
        _addRow(t);
      });
      var partTbody = document.querySelector('#etv18-participantsTable tbody');
      if (partTbody) partTbody.innerHTML = '';
      var inpInspector = document.getElementById('inp-inspector');
      _addParticipantRow({ name: inpInspector ? inpInspector.value : '' });

      var ctrlTbody = document.querySelector('#etv18-controlTable tbody');
      if (ctrlTbody) ctrlTbody.innerHTML = '';
      _addControlRow();

      ['sampleComposition', 'applicationZone', 'sampleSize', 'notIncluded', 'storagePlace'].forEach(function (id) {
        var el = document.getElementById('etv18-' + id);
        if (el) el.value = '';
      });

      _v18.photos = [];
      _renderPhotoGrid();

      var titleEl = document.getElementById('etv18-title-text');
      if (titleEl) titleEl.innerText = (p.projectName || _t('quality.etalon.title.new_act_short', 'Новый Акт')) + (p.contractor ? ' | ' + p.contractor : '');

      _v18OpenContext = {
        projectName: p.projectName || (inpProject ? inpProject.value : '') || '',
        contractor: p.contractor || '',
        templateKey: p.templateKey || ''
      };

      var view = document.getElementById('etalon-v18-view');
      if (view) {
        view.classList.remove('hidden');
        document.body.classList.add('modal-open');
        view.scrollTo(0, 0);
      }

      if (!skipDraft && FD) {
        var decision = FD.askRestore(FD.KEYS.ETALON_V18, _t('quality.etalon.v18.title', 'Акт-Эталон (Бета)'));
        if (decision === 'continue') {
          var d = FD.get(FD.KEYS.ETALON_V18);
          if (d && d.payload) {
            EtalonV18Actions._applyNewDraft(d.payload).catch(function (e) {
              console.warn('[EtalonV18Actions] restore draft failed', e);
            });
          }
        }
        if (view) {
          FD.bindAutoSave(view, FD.KEYS.ETALON_V18, function () {
            return EtalonV18Actions._collectNewDraft();
          });
        }
      }
    },

    closeConstructor: function () {
      var FD = window.RBIFormDraft;
      if (FD && !_v18.editingId && !window._rbiEtalonV18SkipDraftSave) {
        FD.saveNow(FD.KEYS.ETALON_V18, function () { return EtalonV18Actions._collectNewDraft(); });
      }
      if (FD) FD.unbindAutoSave(FD.KEYS.ETALON_V18);
      var view = document.getElementById('etalon-v18-view');
      if (view) view.classList.add('hidden');
      document.body.classList.remove('modal-open');
    },

    addRow: function (tableId) { _addRow(tableId); },
    removeRow: function (tableId) { _removeLastRow(tableId); },
    addParticipantRow: function () { _addParticipantRow(); },
    removeParticipantRow: function () { _removeLastParticipantRow(); },
    addControlRow: function () { _addControlRow(); },
    removeControlRow: function () { _removeLastControlRow(); },

    addPhoto: function () {
      _v18.photos.push({ desc: '', date: '', photo: '' });
      _renderPhotoGrid();
    },

    removePhoto: function (idx) {
      _v18.photos.splice(idx, 1);
      _renderPhotoGrid();
      _draftNowV18();
    },

    uploadPhoto: function (event, idx) {
      var file = event.target.files[0];
      if (!file) return;
      showToast(_t('quality.etalon.toast.saving_photo', '⚙️ Сохранение фото...'));
      var reader = new FileReader();
      reader.onload = async function (e) {
        var localUrl = await PhotoManager.saveLocal(e.target.result, 'etalon_v18');
        _v18.photos[idx].photo = localUrl;
        _v18.photos[idx]._displayUrl = await PhotoManager.getAsyncUrl(localUrl) || window.getPhotoSrc(localUrl);
        _renderPhotoGrid();
        showToast(_t('quality.etalon.v18.toast.photo_saved', '📸 Фото сохранено!'));
        _draftNowV18();
      };
      reader.readAsDataURL(file);
    },

    updatePhotoDesc: function (idx, value) {
      if (_v18.photos[idx]) _v18.photos[idx].desc = value;
    },

    /**
     * Собирает все 11 разделов формы из DOM в объект details.actV18
     * и сохраняет запись в rbi_etalon_acts с source_kind: 'act_v18'.
     */
    saveAct: async function (printAfter) {
      var selProject = document.getElementById('etv18-project').value.trim();
      var selContractor = document.getElementById('etv18-contractor').value.trim();
      var selTemplateKey = document.getElementById('etv18-template').value;
      var tmplSelect = document.getElementById('etv18-template');
      var selectedOption = tmplSelect.options[tmplSelect.selectedIndex];
      var selTemplateTitle = selectedOption ? selectedOption.text.replace(/\[.*?\]\s*/, '') : '';
      var location = document.getElementById('etv18-location').value.trim();

      if (!selProject || !selContractor || !selTemplateKey) return showToast(_t('quality.etalon.toast.required_fields', '⚠️ Укажите Объект, Подрядчика и Вид работ!'));
      if (!location) return showToast(_t('quality.etalon.v18.toast.required_location', '⚠️ Заполните локацию (место устройства)!'));

      var participants = _collectParticipants();
      if (participants.length === 0) return showToast(_t('quality.etalon.v18.toast.required_participants', '⚠️ Укажите хотя бы одного участника рассмотрения!'));

      var actV18 = {
        header: {
          typeSmr: document.getElementById('etv18-type-smr').checked,
          typeProduct: document.getElementById('etv18-type-product').checked,
          typeNode: document.getElementById('etv18-type-node').checked,
          typeFinish: document.getElementById('etv18-type-finish').checked,
          typeOther: document.getElementById('etv18-type-other').checked,
          typeOtherText: document.getElementById('etv18-type-other-text').value.trim(),
          object: document.getElementById('etv18-object').value.trim(),
          address: document.getElementById('etv18-address').value.trim(),
          name: document.getElementById('etv18-name').value.trim(),
          location: location,
          inspectionDate: document.getElementById('etv18-inspection-date').value
        },
        participants: participants,
        scope: {
          sampleComposition: document.getElementById('etv18-sampleComposition').value.trim(),
          applicationZone: document.getElementById('etv18-applicationZone').value.trim(),
          sampleSize: document.getElementById('etv18-sampleSize').value.trim(),
          notIncluded: document.getElementById('etv18-notIncluded').value.trim()
        },
        documents: _collectRows('documentsTable'),
        solutions: _collectRows('solutionsTable'),
        materials: _collectRows('materialsTable'),
        controls: _collectControls(),
        tests: _collectRows('testsTable'),
        remarks: _collectRows('remarksTable'),
        decision: _collectDecision(),
        attachments: _collectRows('attachmentsTable'),
        photos: _v18.photos.map(function (p) { return { desc: p.desc, date: p.date, photo: p.photo }; }).filter(function (p) { return p.photo || p.desc; })
      };

      var etalonId = _v18.editingId || window.RbiIds.newId();
      var myName = 'Инженер';
      if (window.RBI && window.RBI.services && window.RBI.services.settings) {
        myName = window.RBI.services.settings.get('engineerName') || myName;
      }

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
        stageName: 'Акт-Эталон (Бета)',
        checkedStagesInfo: ['Фиксация эталона (структурированный акт)'],
        isCompleted: true,
        state: { '9901': 'ok' },
        photos: {},
        source_kind: 'act_v18',
        details: {
          participants: participants.map(function (p) {
            return p.organization + (p.position ? ', ' + p.position : '') + (p.name ? ' — ' + p.name : '');
          }).join('; '),
          deviations: (actV18.remarks && actV18.remarks.length) ? REMARKS_REF_RU : DEVIATIONS_DEFAULT_RU,
          elements: [], // Совместимость со старым просмотрщиком/печатью (см. printEtalon) — пусто для act_v18.
          actV18: actV18
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
      _v18.editingId = null;

      showToast(_t('quality.etalon.v18.toast.saved', '✅ Акт-Эталон (Бета) успешно сохранён!'));
      localStorage.setItem('rbi_cloud_dirty', '1');
      setTimeout(function () { _triggerSync('silent'); }, 800);

      window._rbiEtalonV18SkipDraftSave = true;
      if (window.RBIFormDraft) {
        window.RBIFormDraft.clear(window.RBIFormDraft.KEYS.ETALON_V18);
        window.RBIFormDraft.unbindAutoSave(window.RBIFormDraft.KEYS.ETALON_V18);
      }

      if (printAfter) {
        setTimeout(function () { if (typeof window.printEtalonActV18 === 'function') window.printEtalonActV18(record.id); }, 500);
      } else {
        EtalonV18Actions.closeConstructor();
      }
      window._rbiEtalonV18SkipDraftSave = false;
      if (window.RBIFormDraft) window.RBIFormDraft.clear(window.RBIFormDraft.KEYS.ETALON_V18);

      setTimeout(function () {
        if (typeof rbi_renderPracticesTab === 'function') rbi_renderPracticesTab();
        if (typeof renderHistoryTab === 'function') renderHistoryTab();
      }, 200);

      document.dispatchEvent(new CustomEvent('etalon:act:saved', { detail: { id: record.id, printAfter: !!printAfter, sourceKind: 'act_v18' } }));
    },

    /**
     * Загружает существующий акт act_v18 в конструктор для редактирования.
     */
    editAct: async function (id) {
      var record = _etalonActs().find(function (a) { return String(a.id) === String(id); });
      if (!record || !record.details || !record.details.actV18) return showToast(_t('quality.etalon.v18.toast.not_found', '❌ Акт не найден'));

      window._rbiEtalonV18SkipDraft = true;
      EtalonV18Actions.openConstructor({
        projectName: record.projectName,
        contractor: record.contractorName,
        templateKey: record.templateKey,
        templateTitle: record.templateTitle
      });
      _v18.editingId = id;

      var a = record.details.actV18;
      var h = a.header || {};
      document.getElementById('etv18-type-smr').checked = !!h.typeSmr;
      document.getElementById('etv18-type-product').checked = !!h.typeProduct;
      document.getElementById('etv18-type-node').checked = !!h.typeNode;
      document.getElementById('etv18-type-finish').checked = !!h.typeFinish;
      document.getElementById('etv18-type-other').checked = !!h.typeOther;
      document.getElementById('etv18-type-other-text').value = h.typeOtherText || '';
      document.getElementById('etv18-object').value = h.object || '';
      document.getElementById('etv18-address').value = h.address || '';
      document.getElementById('etv18-name').value = h.name || '';
      document.getElementById('etv18-location').value = h.location || record.location || '';
      document.getElementById('etv18-inspection-date').value = h.inspectionDate || '';

      var partTbody = document.querySelector('#etv18-participantsTable tbody');
      if (partTbody) partTbody.innerHTML = '';
      (a.participants || []).forEach(function (p) { _addParticipantRow(p); });
      if (!a.participants || !a.participants.length) _addParticipantRow();

      var scope = a.scope || {};
      document.getElementById('etv18-sampleComposition').value = scope.sampleComposition || '';
      document.getElementById('etv18-applicationZone').value = scope.applicationZone || '';
      document.getElementById('etv18-sampleSize').value = scope.sampleSize || '';
      document.getElementById('etv18-notIncluded').value = scope.notIncluded || '';

      function fillRows(tableId, rows) {
        var tbody = document.querySelector('#' + tableId + ' tbody');
        if (tbody) tbody.innerHTML = '';
        (rows || []).forEach(function (r) { _addRow(tableId, r); });
        if (!rows || !rows.length) _addRow(tableId);
      }
      fillRows('documentsTable', a.documents);
      fillRows('solutionsTable', a.solutions);
      fillRows('materialsTable', a.materials);
      fillRows('testsTable', a.tests);
      fillRows('remarksTable', a.remarks);
      fillRows('attachmentsTable', a.attachments);

      var ctrlTbody = document.querySelector('#etv18-controlTable tbody');
      if (ctrlTbody) ctrlTbody.innerHTML = '';
      (a.controls || []).forEach(function (c) { _addControlRow(c); });
      if (!a.controls || !a.controls.length) _addControlRow();

      var decision = a.decision || {};
      if (decision.result) {
        var decisionRadio = document.querySelector('input[name="etv18-decision"][value="' + decision.result + '"]');
        if (decisionRadio) decisionRadio.checked = true;
      }
      if (decision.storage) {
        var storageRadio = document.querySelector('input[name="etv18-storage"][value="' + decision.storage + '"]');
        if (storageRadio) storageRadio.checked = true;
      }
      document.getElementById('etv18-storage-place').value = decision.storagePlace || '';

      _v18.photos = (a.photos || []).map(function (p) { return { desc: p.desc || '', date: p.date || '', photo: p.photo || '' }; });
      await _hydratePhotoPreviews();

      var titleEl = document.getElementById('etv18-title-text');
      if (titleEl) titleEl.innerText = (record.projectName || _t('quality.etalon.title.act_short', 'Акт')) + ' | ' + record.contractorName;
    }
  };

  window.EtalonV18Actions = EtalonV18Actions;

  // window-прокси для onclick-разметки (по образцу etalon.actions.js).
  window.openEtalonV18Constructor = EtalonV18Actions.openConstructor.bind(EtalonV18Actions);
  window.closeEtalonV18Constructor = EtalonV18Actions.closeConstructor.bind(EtalonV18Actions);
  window.saveEtalonV18Act = EtalonV18Actions.saveAct.bind(EtalonV18Actions);
  window.editEtalonV18Act = EtalonV18Actions.editAct.bind(EtalonV18Actions);
  window.rbi_etalonV18AddRow = EtalonV18Actions.addRow.bind(EtalonV18Actions);
  window.rbi_etalonV18RemoveRow = EtalonV18Actions.removeRow.bind(EtalonV18Actions);
  window.rbi_etalonV18AddParticipant = EtalonV18Actions.addParticipantRow.bind(EtalonV18Actions);
  window.rbi_etalonV18RemoveParticipant = EtalonV18Actions.removeParticipantRow.bind(EtalonV18Actions);
  window.rbi_etalonV18AddControlRow = EtalonV18Actions.addControlRow.bind(EtalonV18Actions);
  window.rbi_etalonV18RemoveControlRow = EtalonV18Actions.removeControlRow.bind(EtalonV18Actions);
  window.rbi_etalonV18AddPhoto = EtalonV18Actions.addPhoto.bind(EtalonV18Actions);
  window.rbi_etalonV18RemovePhoto = EtalonV18Actions.removePhoto.bind(EtalonV18Actions);
  window.rbi_etalonV18UploadPhoto = EtalonV18Actions.uploadPhoto.bind(EtalonV18Actions);
  window.rbi_etalonV18UpdatePhotoDesc = EtalonV18Actions.updatePhotoDesc.bind(EtalonV18Actions);

  console.log('[EtalonV18Actions] etalon-v18.actions.js loaded');
}());
