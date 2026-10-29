// etalon.actions.js — Фаза 18+: бизнес-действия модуля Etalon (owner-module)
//
// Реализация перенесена из js/etalon.js (удалён). Источник состояния —
// window.etalonActsArray/window.weeklyPlanData/window.contractorStatuses
// (синхронизированы в js/app.js/js/game.js). Остальные глобалы (app.js) —
// как есть (bare identifiers через typeof-guard, по паттерну audit.actions.js).
// Эмитит: etalon:act:saved, etalon:act:deleted, etalon:initialized.

(function () {
  'use strict';

  var DEVIATIONS_DEFAULT_RU = 'Отклонений не выявлено';

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

  function _isDefaultDeviations(val) {
    if (!val) return true;
    return val === DEVIATIONS_DEFAULT_RU ||
      val === _t('quality.etalon.placeholder.deviations', DEVIATIONS_DEFAULT_RU);
  }

  function emit(eventName, detail) {
    document.dispatchEvent(new CustomEvent(eventName, { detail: detail || {} }));
    var events = EtalonActions._ctx && EtalonActions._ctx.events;
    if (events && typeof events.emit === 'function') {
      events.emit(eventName, detail || {});
    }
  }

  function _getSetting(key) {
    if (EtalonActions._ctx && EtalonActions._ctx.settings) return EtalonActions._ctx.settings.get(key);
    return window.RBI.services.settings.get(key);
  }

  function _triggerSync(mode) {
    var m = mode || 'silent';
    if (EtalonActions._ctx && EtalonActions._ctx.sync) return EtalonActions._ctx.sync.trigger(m);
    if (window.RBI && window.RBI.services && window.RBI.services.sync) return window.RBI.services.sync.trigger(m);
    if (typeof triggerSync === 'function') return triggerSync(m);
    return Promise.resolve(false);
  }

  function _gameLogAction(actionType, targetId) {
    if (EtalonActions._ctx && EtalonActions._ctx.game) {
      return EtalonActions._ctx.game.logAction(actionType, targetId);
    }
    if (window.RBI && window.RBI.services && window.RBI.services.game) {
      return window.RBI.services.game.logAction(actionType, targetId);
    }
    if (typeof gameLogAction === 'function') return gameLogAction(actionType, targetId);
  }

  function _storage() {
    if (EtalonActions._ctx && EtalonActions._ctx.storage) return EtalonActions._ctx.storage;
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

  function _getTasks() {
    if (EtalonActions._ctx && EtalonActions._ctx.tasks) return EtalonActions._ctx.tasks.getTasksSync();
    if (window.RBI && window.RBI.services && window.RBI.services.tasks) {
      return window.RBI.services.tasks.getTasksSync();
    }
    return typeof window.rbi_tasksData !== 'undefined' ? window.rbi_tasksData : [];
  }

  function _getWeeklyPlan() {
    if (EtalonActions._ctx && EtalonActions._ctx.game) return EtalonActions._ctx.game.getWeeklyPlanSync();
    if (window.RBI && window.RBI.services && window.RBI.services.game) {
      return window.RBI.services.game.getWeeklyPlanSync();
    }
    return window.weeklyPlanData || { weekId: null, tasks: [], completed: false };
  }

  function _getContractorStatuses() {
    if (EtalonActions._ctx && EtalonActions._ctx.game) return EtalonActions._ctx.game.getContractorStatusesSync();
    if (window.RBI && window.RBI.services && window.RBI.services.game) {
      return window.RBI.services.game.getContractorStatusesSync();
    }
    return window.contractorStatuses || {};
  }

  // Приватное состояние модуля (было currentEtalonContext/etalonElementCounter/
  // currentEtalonUploadId — top-level let в etalon.js).
  var _context = {
    contractor: '',
    templateKey: '',
    templateTitle: '',
    statusKey: '',
    elements: []
  };
  var _elementCounter = 0;
  var _uploadId = null;

  function _escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function (m) {
      if (m === '&') return '&amp;';
      if (m === '<') return '&lt;';
      if (m === '>') return '&gt;';
      return m;
    });
  }

  // ── Конструктор «Комиссия (Участники)» — построчный ввод (Должность/ФИО),
  // 1-в-1 паттерн с meetings.module.js/etalon-v18.actions.js. Старые записи хранят
  // participants как строку (свободный текст) — не переписываем на месте, только
  // приводим к массиву при открытии на редактирование (см. _normalizeEtalonParticipants).
  function _renderEtalonParticipantRowHtml(p) {
    var role = _escapeHtml((p && p.role) || '');
    var name = _escapeHtml((p && p.name) || '');
    return '' +
      '<div class="etalon-participant-row flex gap-2 items-center">' +
      '<input type="text" class="eap-role input-base !py-1.5 !text-rbi-label w-[38%]" placeholder="' + _t('quality.etalon.ph.participant_role', 'Должность') + '" value="' + role + '">' +
      '<input type="text" class="eap-name input-base !py-1.5 !text-rbi-label flex-1" placeholder="' + _t('quality.etalon.ph.participant_name', 'ФИО') + '" value="' + name + '">' +
      '</div>';
  }

  function _collectEtalonParticipantsFromDom() {
    var list = document.getElementById('etalon-participants-list');
    if (!list) return [];
    var out = [];
    list.querySelectorAll('.etalon-participant-row').forEach(function (row) {
      var role = (row.querySelector('.eap-role') && row.querySelector('.eap-role').value || '').trim();
      var name = (row.querySelector('.eap-name') && row.querySelector('.eap-name').value || '').trim();
      if (!role && !name) return;
      out.push({ role: role, name: name });
    });
    return out;
  }

  // Легаси-записи хранят participants как свободный текст — оборачиваем в один
  // ряд (весь текст в ФИО), чтобы ничего не потерять при открытии на редактирование.
  function _normalizeEtalonParticipants(value) {
    if (Array.isArray(value)) return value;
    if (typeof value === 'string' && value.trim()) return [{ role: '', name: value.trim() }];
    return [];
  }

  // Для контекстов простого текста (просмотрщик, PDF, Word meta-строка) —
  // читает и старый строковый, и новый массивный формат.
  function _formatEtalonParticipantsText(value) {
    if (Array.isArray(value)) {
      var parts = value.map(function (p) {
        var name = (p && p.name) || '';
        var role = (p && p.role) || '';
        if (name && role) return name + ' — ' + role;
        return name || role;
      }).filter(Boolean);
      return parts.length ? parts.join('; ') : '';
    }
    return value || '';
  }

  function _addEtalonParticipantRow() {
    var list = document.getElementById('etalon-participants-list');
    if (!list) return;
    list.insertAdjacentHTML('beforeend', _renderEtalonParticipantRowHtml());
  }

  function _removeLastEtalonParticipantRow() {
    var list = document.getElementById('etalon-participants-list');
    if (!list) return;
    var rows = list.querySelectorAll('.etalon-participant-row');
    if (rows.length > 1) rows[rows.length - 1].remove();
  }

  // Перенесено 1:1 из etalon.js (Фаза 76: изоляция userTemplates через
  // TemplateService с fallback).
  function _templates() {
    if (EtalonActions._ctx && EtalonActions._ctx.templates) return EtalonActions._ctx.templates;
    if (window.RBI && window.RBI.services && window.RBI.services.templates) {
      return window.RBI.services.templates;
    }
    return {
      getUserTemplates: function () {
        return typeof window.userTemplates !== 'undefined' ? window.userTemplates : {};
      },
      getByKey: function (key) {
        var ut = typeof window.userTemplates !== 'undefined' ? window.userTemplates : {};
        return ut[key] || null;
      },
      getSystemTemplates: function () {
        return typeof window.SYSTEM_TEMPLATES !== 'undefined' ? window.SYSTEM_TEMPLATES : {};
      }
    };
  }

  // Единая точка доступа к window.etalonActsArray через KnowledgeService
  // (приоритет EtalonActions._ctx.knowledge → window.RBI.services.knowledge →
  // bare window.etalonActsArray).
  function _etalonActs() {
    if (EtalonActions._ctx && EtalonActions._ctx.knowledge && typeof EtalonActions._ctx.knowledge.ensureEtalonActsSync === 'function') {
      return EtalonActions._ctx.knowledge.ensureEtalonActsSync();
    }
    if (window.RBI && window.RBI.services && window.RBI.services.knowledge && typeof window.RBI.services.knowledge.ensureEtalonActsSync === 'function') {
      return window.RBI.services.knowledge.ensureEtalonActsSync();
    }
    if (!Array.isArray(window.etalonActsArray)) window.etalonActsArray = [];
    return window.etalonActsArray;
  }

  var EtalonActions = {

    _ctx: null,
    bindCtx: function (ctx) { this._ctx = ctx; },

    _getOpenContext: function () {
      return {
        contractor: _context.contractor,
        templateKey: _context.templateKey,
        templateTitle: _context.templateTitle,
        projectName: _context.projectName,
        statusKey: _context.statusKey
      };
    },

    remountViewModalChrome: function () {
      var modal = document.getElementById('etalon-view-modal');
      if (!modal) return;
      var wasOpen = modal.style.display === 'flex';
      var actId = null;
      if (wasOpen) {
        var editBtn = modal.querySelector('[onclick*="editEtalonAct"]');
        if (editBtn) {
          var m = editBtn.getAttribute('onclick').match(/editEtalonAct\('([^']+)'\)/);
          if (m) actId = m[1];
        }
      }
      modal.outerHTML = renderEtalonViewModalMarkup();
      if (wasOpen && actId) {
        EtalonActions.openViewer(actId);
      }
    },

    // =====================================================================
    // ОТКРЫТИЕ КОНСТРУКТОРА АКТА-ЭТАЛОНА
    // Перенесено из etalon.js (было window.openEtalonConstructor, строка 39).
    // =====================================================================
    _collectNewDraft: function () {
      if (window.currentEditingEtalonId || window._rbiEtalonSkipDraft) return null;
      const elements = [];
      document.querySelectorAll('.etalon-item').forEach(el => {
        const name = (el.querySelector('.etalon-el-name')?.value || '').trim();
        const desc = (el.querySelector('.etalon-el-desc')?.value || '').trim();
        const photos = EtalonActions._readPhotosFromContainer(el.querySelector('.etalon-photo-container'));
        if (name || desc || photos.length) {
          elements.push({ name, desc, photos });
        }
      });
      const pdfPreview = document.getElementById('etalon-pdf-preview');
      const p = {
        project: document.getElementById('etalon-project')?.value || '',
        contractor: document.getElementById('etalon-contractor')?.value || '',
        templateKey: document.getElementById('etalon-template')?.value || '',
        location: document.getElementById('etalon-location')?.value || '',
        participants: _collectEtalonParticipantsFromDom(),
        deviations: document.getElementById('etalon-deviations')?.value || '',
        elements: elements,
        pdfData: pdfPreview?.dataset?.pdf || '',
        pdfName: document.getElementById('etalon-pdf-name')?.innerText || '',
        statusKey: _context.statusKey || ''
      };
      const defaultInspectorName = (document.getElementById('inp-inspector')?.value || '').trim();
      const participantsChanged = p.participants.length > 1 ||
        (p.participants.length === 1 && (p.participants[0].role || p.participants[0].name !== defaultInspectorName));
      const meaningful = !!(
        (p.location || '').trim() ||
        participantsChanged ||
        (p.deviations || '').trim() ||
        elements.length > 0 ||
        p.pdfData ||
        // пользователь явно сменил объект/подрядчика/вид относительно контекста открытия
        (p.project && p.project !== (_context.projectName || document.getElementById('inp-project')?.value || '')) ||
        (p.contractor && p.contractor !== (_context.contractor || '')) ||
        (p.templateKey && p.templateKey !== (_context.templateKey || ''))
      );
      // Если открыли «пустой» эталон и только заполнили project из inp — не считать черновиком
      // пока нет location/elements. Уже покрыто выше.
      return meaningful ? p : null;
    },

    _applyNewDraft: async function (p) {
      if (!p) return;
      const tmplSelect = document.getElementById('etalon-template');
      if (p.project != null) document.getElementById('etalon-project').value = p.project;
      if (p.contractor != null) document.getElementById('etalon-contractor').value = p.contractor;
      if (p.templateKey && tmplSelect) tmplSelect.value = p.templateKey;
      if (p.location != null) document.getElementById('etalon-location').value = p.location;
      const participantsList = document.getElementById('etalon-participants-list');
      if (participantsList && p.participants != null) {
        const normalized = _normalizeEtalonParticipants(p.participants);
        participantsList.innerHTML = normalized.length
          ? normalized.map(_renderEtalonParticipantRowHtml).join('')
          : _renderEtalonParticipantRowHtml();
      }
      if (p.deviations != null) document.getElementById('etalon-deviations').value = p.deviations;

      document.getElementById('etalon-elements-container').innerHTML = '';
      _elementCounter = 0;
      const els = Array.isArray(p.elements) ? p.elements : [];
      if (els.length === 0) {
        EtalonActions.addElement();
      } else {
        for (let i = 0; i < els.length; i++) {
          EtalonActions.addElement();
          const elId = `etalon-el-${_elementCounter}`;
          const node = document.getElementById(elId);
          if (!node) continue;
          node.querySelector('.etalon-el-name').value = els[i].name || '';
          node.querySelector('.etalon-el-desc').value = els[i].desc || '';
          const photos = EtalonActions._photosFromElementData(els[i]);
          if (photos.length) await EtalonActions._renderElementPhotos(elId, photos);
        }
      }

      if (p.pdfData) {
        const cont = document.getElementById('etalon-pdf-preview');
        if (cont) {
          cont.dataset.pdf = p.pdfData;
          const nameEl = document.getElementById('etalon-pdf-name');
          if (nameEl) nameEl.innerText = p.pdfName || 'doc.pdf';
          cont.classList.remove('hidden');
          const uploadBtn = document.getElementById('etalon-pdf-upload-btn');
          if (uploadBtn) uploadBtn.classList.add('hidden');
        }
      }
    },

    openConstructor: function (contractor, templateKey, templateTitle, projectName, statusKey) {
      const skipDraft = !!window._rbiEtalonSkipDraft;
      window._rbiEtalonSkipDraft = false;
      if (!skipDraft) window.currentEditingEtalonId = null;

      _context = {
        contractor: contractor,
        templateKey: templateKey,
        templateTitle: templateTitle,
        projectName: projectName,
        statusKey: statusKey,
        elements: []
      };
      _elementCounter = 0;

      const FD = window.RBIFormDraft;
      if (FD) FD.unbindAutoSave(FD.KEYS.ETALON_NEW);

      document.getElementById('etalon-location').value = '';
      const newParticipantsList = document.getElementById('etalon-participants-list');
      if (newParticipantsList) {
        newParticipantsList.innerHTML = _renderEtalonParticipantRowHtml({
          role: '',
          name: document.getElementById('inp-inspector')?.value || ''
        });
      }
      document.getElementById('etalon-deviations').value = '';
      document.getElementById('etalon-elements-container').innerHTML = '';

      // Убрать старый PDF-блок при повторном открытии
      const oldPdf = document.getElementById('etalon-pdf-wrap');
      if (oldPdf) oldPdf.remove();

      document.getElementById('etalon-title-text').innerText = `${projectName} | ${contractor} | ${templateTitle}`;
      // === Заполняем выпадающий список видов работ ===
      const tmplSelect = document.getElementById('etalon-template');
      let tmplOpts = '<option value="" disabled selected>' + _t('quality.etalon.select.template', '-- Выберите вид работ --') + '</option>';

      const _st = _templates().getSystemTemplates();
      const sysKeys = Object.keys(_st).sort((a, b) => _st[a].title.localeCompare(_st[b].title));
      sysKeys.forEach(k => tmplOpts += `<option value="sys_${k}">[${_t('quality.etalon.tag.system', 'СИС')}] ${_st[k].title}</option>`);

      const _ut = _templates().getUserTemplates();
      if (Object.keys(_ut).length > 0) {
        const userKeys = Object.keys(_ut).sort((a, b) => _ut[a].title.localeCompare(_ut[b].title));
        userKeys.forEach(k => tmplOpts += `<option value="user_${k}">[${_t('quality.etalon.tag.user', 'МОЙ')}] ${_ut[k].title}</option>`);
      }
      tmplSelect.innerHTML = tmplOpts;

      // === Заполняем поля значениями ===
      document.getElementById('etalon-project').value = projectName || document.getElementById('inp-project')?.value || '';
      document.getElementById('etalon-contractor').value = contractor || '';
      if (templateKey) tmplSelect.value = templateKey;

      if (typeof initSmartInput === 'function') {
        initSmartInput('etalon-project', 'projectName');
        initSmartInput('etalon-contractor', 'contractorName');
      }

      if (contractor && templateTitle) {
        document.getElementById('etalon-title-text').innerText = `${projectName || _t('quality.etalon.title.project_fallback', 'Объект')} | ${contractor}`;
      } else {
        document.getElementById('etalon-title-text').innerText = _t('quality.etalon.title.new_act', 'Новый Акт-Эталон');
      }
      // Добавляем первый пустой элемент по умолчанию
      EtalonActions.addElement();
      // === ДОБАВЛЯЕМ КНОПКУ ЗАГРУЗКИ PDF ===
      const pdfBlockHtml = `
        <div id="etalon-pdf-wrap" class="mt-4 pt-4 border-t border-surface">
            <div class="font-black text-rbi-caption text-brand uppercase tracking-widest mb-2">${_t('quality.etalon.section.pdf_optional', 'Готовый PDF-Акт (Опционально)')}</div>
            <div id="etalon-pdf-preview" data-pdf="" class="hidden mb-2 bg-surface border border-surface p-3 rounded-xl flex justify-between items-center">
                <div class="min-w-0 pr-3">
                    <div class="text-rbi-label font-black text-ink truncate" id="etalon-pdf-name">doc.pdf</div>
                </div>
                <button onclick="window.removeEtalonPdf()" class="w-8 h-8 bg-surface rounded-full flex items-center justify-center text-danger font-black shadow-sm border border-surface active:scale-90 shrink-0">✕</button>
            </div>
            <button id="etalon-pdf-upload-btn" onclick="document.getElementById('etalon-pdf-input').click()" class="w-full bg-surface text-muted py-3 rounded-lg border border-dashed border-surface font-bold text-rbi-caption uppercase active:scale-95 transition-colors flex items-center justify-center gap-2">
                📄 ${_t('quality.etalon.btn.attach_pdf', 'Прикрепить готовый PDF')}
            </button>
            <input type="file" id="etalon-pdf-input" accept="application/pdf" class="hidden" onchange="window.handleEtalonPdfUpload(event)">
        </div>
      `;
      document.getElementById('etalon-elements-container').insertAdjacentHTML('afterend', pdfBlockHtml);
      // Динамически внедряем кнопки "Сохранить" и "Печать"
      const headerTitle = (contractor && templateTitle)
        ? `${projectName || _t('quality.etalon.title.project_fallback', 'Объект')} | ${contractor}`
        : _t('quality.etalon.title.new_act', 'Новый Акт-Эталон');
      const headerContainer = document.getElementById('etalon-title-text').parentElement;
      headerContainer.innerHTML = `
        <button onclick="closeEtalonConstructor()" class="text-rbi-label font-bold text-muted flex items-center gap-1 active:scale-95 bg-surface px-3 py-2 rounded-lg transition-colors shrink-0">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7"></path></svg> ${_t('quality.etalon.btn.back', 'Назад')}
        </button>
        <div class="text-rbi-body font-black text-ink uppercase tracking-widest text-center flex-1 truncate px-2" id="etalon-title-text">${headerTitle}</div>
        <div class="flex gap-1.5 shrink-0">
            <button onclick="saveEtalonAct(false)" class="text-rbi-caption font-bold text-ink bg-surface border border-surface px-3 py-2 rounded-lg active:scale-95 shadow-sm transition-colors">${_t('quality.etalon.btn.save', 'Сохранить')}</button>
            <button onclick="saveEtalonAct(true)" class="text-rbi-caption font-bold text-white bg-brand px-3 py-2 rounded-lg active:scale-95 shadow-md transition-colors flex items-center gap-1.5"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"></path></svg> ${_t('quality.etalon.btn.print', 'Печать')}</button>
        </div>
      `;
      const view = document.getElementById('etalon-constructor-view');
      view.classList.remove('hidden');
      document.body.classList.add('modal-open');
      view.scrollTo(0, 0);

      if (!skipDraft && FD) {
        const decision = FD.askRestore(FD.KEYS.ETALON_NEW, _t('quality.etalon.title.act', 'Акт-Эталон'));
        if (decision === 'continue') {
          const d = FD.get(FD.KEYS.ETALON_NEW);
          if (d && d.payload) {
            EtalonActions._applyNewDraft(d.payload).catch(function (e) {
              console.warn('[EtalonActions] restore draft failed', e);
            });
          }
        }
        FD.bindAutoSave(view, FD.KEYS.ETALON_NEW, function () {
          return EtalonActions._collectNewDraft();
        });
      }
    },

    // =====================================================================
    // ЗАКРЫТИЕ КОНСТРУКТОРА
    // Перенесено из etalon.js (было window.closeEtalonConstructor, строка 127).
    // =====================================================================
    closeConstructor: function () {
      const FD = window.RBIFormDraft;
      if (FD && !window.currentEditingEtalonId && !window._rbiEtalonSkipDraftSave) {
        FD.saveNow(FD.KEYS.ETALON_NEW, function () { return EtalonActions._collectNewDraft(); });
      }
      if (FD) FD.unbindAutoSave(FD.KEYS.ETALON_NEW);
      document.getElementById('etalon-constructor-view').classList.add('hidden');
      document.body.classList.remove('modal-open');
    },

    // =====================================================================
    // ФОТО УЗЛА: список (photos[]) + обратная совместимость с одиночным photo
    // =====================================================================
    _photosFromElementData: function (el) {
      if (!el) return [];
      if (Array.isArray(el.photos) && el.photos.length) {
        return el.photos.filter(Boolean);
      }
      return el.photo ? [el.photo] : [];
    },

    _readPhotosFromContainer: function (container) {
      if (!container) return [];
      try {
        const raw = container.dataset.photos;
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) return parsed.filter(Boolean);
        }
      } catch (_) { /* ignore */ }
      return container.dataset.photo ? [container.dataset.photo] : [];
    },

    _writePhotosToContainer: function (container, photos) {
      const list = (photos || []).filter(Boolean);
      container.dataset.photos = JSON.stringify(list);
      container.dataset.photo = list[0] || '';
    },

    _renderElementPhotos: async function (elId, photos) {
      const node = document.getElementById(elId);
      if (!node) return;
      const container = node.querySelector('.etalon-photo-container');
      if (!container) return;
      const list = (photos || []).filter(Boolean);
      this._writePhotosToContainer(container, list);

      if (!list.length) {
        container.innerHTML = `
        <button type="button" onclick="triggerEtalonPhotoUpload('${elId}')" class="w-full bg-surface text-muted py-3 rounded-lg border border-dashed border-surface font-bold text-rbi-caption uppercase active:scale-95 transition-colors flex items-center justify-center gap-2">
            📸 ${_t('quality.etalon.btn.attach_photo', 'Прикрепить фото узла')}
        </button>`;
        return;
      }

      let thumbs = '';
      for (let i = 0; i < list.length; i++) {
        const ref = list[i];
        const displayUrl = await PhotoManager.getAsyncUrl(ref) || window.getPhotoSrc(ref) || '';
        thumbs += `
        <div class="relative rounded-lg overflow-hidden border border-surface bg-surface aspect-[4/3]">
            <img src="${displayUrl}" class="w-full h-full object-cover cursor-pointer" onclick="setTimeout(() => openPhotoViewer('${ref}'), 100)" alt="">
            <button type="button" onclick="event.stopPropagation();removeEtalonPhoto('${elId}', ${i})" class="absolute top-1.5 right-1.5 bg-danger text-white w-7 h-7 rounded-full flex items-center justify-center font-black text-xs shadow-md active:scale-90" aria-label="${_t('quality.etalon.aria.remove_photo', 'Удалить фото')}">✕</button>
            <div class="absolute bottom-1 left-1.5 text-rbi-caption font-black text-white bg-slate-900/60 px-1.5 py-0.5 rounded">${i + 1}/${list.length}</div>
        </div>`;
      }

      container.innerHTML = `
        <div class="grid grid-cols-2 gap-2 mt-1">${thumbs}</div>
        <button type="button" onclick="triggerEtalonPhotoUpload('${elId}')" class="mt-2 w-full bg-brand-soft text-brand py-2.5 rounded-lg border border-dashed border-brand-soft font-bold text-rbi-caption uppercase active:scale-95 transition-colors flex items-center justify-center gap-2">
            + ${_t('quality.etalon.btn.add_more_photo', 'Ещё фото к узлу')}
        </button>`;
    },

    // =====================================================================
    // ДОБАВЛЕНИЕ ЭЛЕМЕНТА ЭТАЛОНА
    // Перенесено из etalon.js (было window.addEtalonElement, строка 132).
    // =====================================================================
    addElement: function () {
      _elementCounter++;
      const elId = `etalon-el-${_elementCounter}`;

      const html = `
        <div id="${elId}" class="etalon-item bg-surface border border-surface rounded-xl p-3 shadow-sm relative mb-3">
            <button onclick="document.getElementById('${elId}').remove()" class="absolute top-2 right-2 text-danger active:scale-90 font-black text-sm px-2">✕</button>
            <div class="font-black text-rbi-caption text-brand uppercase tracking-widest mb-2">${_t('quality.etalon.label.element', 'Элемент эталона')}</div>
            
            <input type="text" class="etalon-el-name input-base text-rbi-body mb-2 font-bold" placeholder="${_t('quality.etalon.placeholder.element_name', 'Название (напр: Устройство швов)')}">
            <textarea class="etalon-el-desc input-base text-rbi-label h-12 resize-none mb-2" placeholder="${_t('quality.etalon.placeholder.element_desc', 'Описание выполнения...')}"></textarea>
            
            <div class="etalon-photo-container" data-photo="" data-photos="[]">
                <button type="button" onclick="triggerEtalonPhotoUpload('${elId}')" class="w-full bg-surface text-muted py-3 rounded-lg border border-dashed border-surface font-bold text-rbi-caption uppercase active:scale-95 transition-colors flex items-center justify-center gap-2">
                    📸 ${_t('quality.etalon.btn.attach_photo', 'Прикрепить фото узла')}
                </button>
            </div>
        </div>
      `;
      document.getElementById('etalon-elements-container').insertAdjacentHTML('beforeend', html);
    },

    // =====================================================================
    // ЗАПУСК ЗАГРУЗКИ ФОТО УЗЛА
    // Перенесено из etalon.js (было window.triggerEtalonPhotoUpload, строка 154).
    // =====================================================================
    triggerPhotoUpload: function (elId) {
      _uploadId = elId;
      window.activePhotoContext = 'etalon'; // Говорим системе, что фото идет в Эталон
      document.getElementById('photo-source-modal').style.display = 'flex'; // Открываем выбор: Камера/Галерея
    },

    // =====================================================================
    // СОХРАНЕНИЕ ОТМЕЧЕННОГО ФОТО (после редактора) — добавляет к списку узла
    // =====================================================================
    saveMarkupPhoto: async function () {
      if (!window.editorCanvas || !_uploadId) return;

      const base64 = window.editorCanvas.toDataURL('image/jpeg', 0.85);
      showToast(_t('quality.etalon.toast.saving_photo', '⚙️ Сохранение фото в базу...'));

      const localUrl = await PhotoManager.saveLocal(base64, 'etalon');
      const container = document.getElementById(_uploadId).querySelector('.etalon-photo-container');
      const list = this._readPhotosFromContainer(container);
      list.push(localUrl);
      await this._renderElementPhotos(_uploadId, list);

      showToast(_t('quality.etalon.toast.photo_saved', '📸 Фото эталона сохранено ({count})', { count: list.length }));
      cancelPhotoEditor();
      if (window.RBIFormDraft && !window.currentEditingEtalonId) {
        window.RBIFormDraft.saveNow(window.RBIFormDraft.KEYS.ETALON_NEW, function () {
          return EtalonActions._collectNewDraft();
        });
      }
    },

    // =====================================================================
    // УДАЛЕНИЕ ФОТО УЗЛА (index — конкретное; без index — все)
    // =====================================================================
    removePhotoEl: async function (elId, photoIndex) {
      const container = document.getElementById(elId) && document.getElementById(elId).querySelector('.etalon-photo-container');
      if (!container) return;
      let list = this._readPhotosFromContainer(container);
      if (photoIndex === undefined || photoIndex === null || photoIndex === '') {
        list = [];
      } else {
        const idx = Number(photoIndex);
        if (!Number.isNaN(idx)) list = list.filter((_, i) => i !== idx);
      }
      await this._renderElementPhotos(elId, list);
    },

    // =====================================================================
    // ОЖИДАНИЕ ГОТОВНОСТИ ЛОКАЛЬНЫХ ФАЙЛОВ ПЕРЕД СИНХРОНИЗАЦИЕЙ
    // Устраняет гонку: PhotoManager.saveLocal() кладёт файл в IndexedDB
    // асинхронно, а saveAct() раньше запускал sync через фиксированный
    // setTimeout(800ms) "на удачу". Здесь мы опрашиваем dbGet до тех пор,
    // пока каждый local:// файл акта (PDF + фото элементов) не станет
    // читаемым, либо не истечёт разумный лимит попыток.
    // =====================================================================
    _waitForLocalFilesReady: async function (etalonRecord, maxAttempts = 20, delayMs = 150) {
      var urls = [];
      var d = etalonRecord && etalonRecord.details || {};
      if (d.pdfData) urls.push(d.pdfData);
      (d.elements || []).forEach(function (el) {
        EtalonActions._photosFromElementData(el).forEach(function (u) { urls.push(u); });
      });
      urls = urls.filter(function (u) { return typeof u === 'string' && u.startsWith('local://'); });
      if (urls.length === 0) return;

      var storage = _storage();
      for (var i = 0; i < maxAttempts; i++) {
        var pending = [];
        for (var u of urls) {
          var rec = await storage.get(storage.stores().PHOTOS, u);
          if (!rec || !rec.data) pending.push(u);
        }
        if (pending.length === 0) return;
        urls = pending;
        await new Promise(function (r) { setTimeout(r, delayMs); });
      }
      console.warn('[EtalonActions] Не все локальные файлы акта дозаписались в IndexedDB перед синхронизацией:', urls);
    },

    // =====================================================================
    // СОХРАНЕНИЕ АКТА-ЭТАЛОНА
    // Перенесено из etalon.js (было window.saveEtalonAct, строка 198).
    // =====================================================================
    saveAct: async function (printAfter = false) {
      // Считываем значения из новых полей
      const selProject = document.getElementById('etalon-project').value.trim();
      const selContractor = document.getElementById('etalon-contractor').value.trim();
      const selTemplateKey = document.getElementById('etalon-template').value;
      const selTemplateTitle = document.getElementById('etalon-template').options[document.getElementById('etalon-template').selectedIndex]?.text.replace(/\[.*?\]\s*/, '') || '';

      const location = document.getElementById('etalon-location').value.trim();
      const participants = _collectEtalonParticipantsFromDom();
      const deviations = document.getElementById('etalon-deviations').value.trim() || DEVIATIONS_DEFAULT_RU;
      const myName = _getSetting('engineerName') || 'Инженер';

      if (!selProject || !selContractor || !selTemplateKey) return showToast(_t('quality.etalon.toast.required_fields', '⚠️ Укажите Объект, Подрядчика и Вид работ!'));
      if (!location || !participants.length) return showToast(_t('quality.etalon.toast.required_location', '⚠️ Заполните локацию и участников!'));

      const elements = [];
      document.querySelectorAll('.etalon-item').forEach(el => {
        const name = el.querySelector('.etalon-el-name').value.trim();
        const desc = el.querySelector('.etalon-el-desc').value.trim();
        const photos = EtalonActions._readPhotosFromContainer(el.querySelector('.etalon-photo-container'));
        if (name) {
          elements.push({
            name,
            desc,
            photos,
            photo: photos[0] || null, // совместимость со старым просмотром/печатью
          });
        }
      });

      if (elements.length === 0) return showToast(_t('quality.etalon.toast.required_element', '⚠️ Добавьте хотя бы один элемент эталона!'));

      let etalonId = window.currentEditingEtalonId || String(Date.now() + Math.floor(Math.random() * 1000));

      const etalonRecord = {
        id: etalonId,
        owner: myName, // Для синхронизации прав
        date: new Date().toISOString(),
        projectName: selProject, // Строго берем из поля Объект
        inspectorName: myName,
        contractorName: selContractor, // Строго берем из поля Подрядчик
        templateKey: selTemplateKey,
        templateTitle: selTemplateTitle,
        location: location,
        instanceId: "etalon",
        stageId: 0,
        stageName: "Акт-Эталон",
        checkedStagesInfo: ["Фиксация эталона"],
        isCompleted: true,
        state: { '9901': 'ok' },
        photos: {},
        details: {
          participants: participants,
          deviations: deviations,
          elements: elements,
          pdfData: document.getElementById('etalon-pdf-preview')?.dataset.pdf || null,
          pdfName: document.getElementById('etalon-pdf-name')?.innerText || ''
        },
        metrics: { final: 100, baseUrkPerc: 100, checkedCount: 1, totalCount: 1, n_B1_fail: 0, n_B2_fail: 0, n_B3_fail: 0, kc: 1, kcrit: 1, statusTxt: "ЭТАЛОН", statusCls: "tag-blue" },
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

      // Сохраняем ТОЛЬКО в массив эталонов
      const etalonActs1 = _etalonActs();
      const idx = etalonActs1.findIndex(x => String(x.id) === String(etalonId));
      if (idx !== -1) {
        etalonActs1[idx] = etalonRecord;
      } else {
        etalonActs1.push(etalonRecord);
      }
      await _storage().put(_storage().stores().ETALON_ACTS, etalonRecord);
      window.currentEditingEtalonId = null; // Сбрасываем ID
      window._rbiEtalonSkipDraftSave = true;
      if (window.RBIFormDraft) {
        window.RBIFormDraft.clear(window.RBIFormDraft.KEYS.ETALON_NEW);
        window.RBIFormDraft.unbindAutoSave(window.RBIFormDraft.KEYS.ETALON_NEW);
      }

      if (_context.statusKey && _getWeeklyPlan().tasks) {
        const task = _getWeeklyPlan().tasks.find(t => t.statusKey === _context.statusKey);
        if (task) {
          task.needsEtalon = false;
          if (_getContractorStatuses()[task.statusKey]) _getContractorStatuses()[task.statusKey].etalonCompleted = true;
          await _storage().put(_storage().stores().SETTINGS, { key: 'weekly_plan_data', data: _getWeeklyPlan() });
        }
      }

      _gameLogAction('etalon_accepted', etalonRecord.id);
      // АВТОЗАКРЫТИЕ ЗАДАЧИ ЭТАЛОНА
      if (Array.isArray(_getTasks())) {
        const etalTasks = _getTasks().filter(t =>
          (t.taskType === 'Эталон' || (t.title && t.title.includes('Эталон'))) &&
          (t.status === 'pending' || t.status === 'paused') &&
          (typeof window.rbiEtalonMatchesWork === 'function'
            ? window.rbiEtalonMatchesWork(etalonRecord, t.contractor, t.templateKey, t.templateTitle, t.workTitle)
            : (t.contractor === etalonRecord.contractorName &&
              (t.templateKey === etalonRecord.templateKey || t.templateTitle === etalonRecord.templateTitle || t.workTitle === etalonRecord.templateTitle)))
        );
        for (let t of etalTasks) {
          t.status = 'done';
          t.done = 1;
          t.resultComment = 'Акт-Эталон сохранен';
          t.updatedAt = new Date().toISOString();
          if (typeof dbPut === 'function') await _storage().put(_storage().stores().TASKS, t);
        }
        if (etalTasks.length > 0 && typeof rbi_renderTasksList === 'function') {
          rbi_renderTasksList();
        }
      }
      showToast(_t('quality.etalon.toast.saved', '✅ Акт-Эталон успешно сохранен!'));
      localStorage.setItem('rbi_cloud_dirty', '1');
      // RBI FIX (гонка "PDF/фото Акта-Эталона не синхронизируется"): раньше здесь был
      // фиксированный setTimeout(800ms) "на удачу" — на медленном устройстве или при
      // большом PDF запись в IndexedDB могла не успеть завершиться к этому моменту,
      // sync уходил без файла, а сама запись сразу помечалась "синхронизировано" без
      // повторных попыток. Теперь перед запуском синхронизации явно подтверждаем,
      // что все local:// файлы этого акта (PDF + фото элементов) реально читаются
      // из IndexedDB, с повторными попытками — и только затем запускаем sync.
      EtalonActions._waitForLocalFilesReady(etalonRecord)
        .then(() => _triggerSync('silent'))
        .catch(function (e) { console.warn('[EtalonActions] Не удалось подтвердить готовность файлов перед синхронизацией:', e); });

      // Если нажали кнопку "Печать" — открываем PDF
      if (printAfter) {
        setTimeout(() => { window.printEtalonAct(etalonRecord.id); }, 500);
      } else {
        EtalonActions.closeConstructor();
      }
      window._rbiEtalonSkipDraftSave = false;
      if (window.RBIFormDraft) window.RBIFormDraft.clear(window.RBIFormDraft.KEYS.ETALON_NEW);

      // Принудительно обновляем все кэши, чтобы Эталон мгновенно появился везде!
      setTimeout(() => {
        var gameSvc = (EtalonActions._ctx && EtalonActions._ctx.game) || (window.RBI && window.RBI.services && window.RBI.services.game);
        if (gameSvc) {
          gameSvc.calculateAllProfiles();
          gameSvc.renderDashboard();
        }
        if (typeof rbi_renderImpactTab === 'function') rbi_renderImpactTab();
        if (typeof rbi_renderTasksList === 'function') rbi_renderTasksList();
        if (typeof renderHistoryTab === 'function') renderHistoryTab();
        if (typeof rbi_renderPracticesTab === 'function') rbi_renderPracticesTab();
      }, 200);

      emit('etalon:act:saved', { id: etalonRecord.id, printAfter: !!printAfter });
    },

    // =====================================================================
    // ПРОСМОТР АКТА-ЭТАЛОНА
    // Перенесено из etalon.js (было window.openEtalonViewer, строка 326).
    // =====================================================================
    openViewer: async function (id, retries = 3) {
      // Пытаемся получить из IndexedDB
      let record = await _storage().get(_storage().stores().ETALON_ACTS, id);
      if (!record && retries > 0) {
        await new Promise(r => setTimeout(r, 150));
        return EtalonActions.openViewer(id, retries - 1);
      }
      const etalonActs2 = _etalonActs();
      if (!record) {
        record = etalonActs2.find(c => String(c.id) === String(id));
        if (!record) {
          showToast(_t('quality.etalon.toast.not_found', '❌ Ошибка: Эталон не найден в базе данных'));
          return;
        }
      }

      // Акты, созданные через конструктор «Акт-Эталон (Бета)» (11 разделов,
      // Блок 2 плана OCR-sync + Акт-Эталон Beta), имеют иную модель данных
      // (details.actV18 вместо details.elements) — просмотр/редактирование
      // делегируется полноэкранному конструктору v18 вместо этого модального окна.
      if (record.source_kind === 'act_v18' && window.EtalonV18Actions) {
        return window.EtalonV18Actions.editAct(id);
      }

      // «Акт-Эталон (Бета 2, ПК)» (см. etalon-v18b.actions.js) — точная копия
      // исходной формы v18 через iframe, доступна только на ПК.
      if (record.source_kind === 'act_v18b' && window.EtalonV18BActions) {
        return window.EtalonV18BActions.editAct(id);
      }

      // Обновляем массив
      const idx = etalonActs2.findIndex(c => String(c.id) === String(id));
      if (idx !== -1) etalonActs2[idx] = record;
      else etalonActs2.push(record);

      const d = record.details || {};
      const elements = d.elements || [];

      let elementsHtml = '';
      for (let i = 0; i < elements.length; i++) {
        const el = elements[i];
        const photoRefs = EtalonActions._photosFromElementData(el);
        let photoHtml = '';
        if (!photoRefs.length) {
          photoHtml = '<div class="text-xs text-muted mt-2">' + _t('quality.etalon.viewer.no_photo', 'Нет фото') + '</div>';
        } else {
          photoHtml = '<div class="grid grid-cols-2 gap-2 mt-2">';
          for (let p = 0; p < photoRefs.length; p++) {
            const ref = photoRefs[p];
            let realPhoto = await PhotoManager.getAsyncUrl(ref) || window.getPhotoSrc(ref);
            if (realPhoto) {
              photoHtml += `<img src="${realPhoto}" class="w-full h-36 object-cover rounded-lg border border-surface cursor-pointer bg-surface" onclick="openPhotoViewer('${ref}')">`;
            }
          }
          photoHtml += '</div>';
        }

        elementsHtml += `
            <div class="bg-surface border border-surface rounded-xl p-3 mb-3">
                <div class="font-black text-rbi-body text-ink uppercase mb-1">${i + 1}. ${_escapeHtml(el.name || _t('quality.etalon.viewer.no_name', 'Без названия'))}</div>
                <div class="text-rbi-label text-muted whitespace-pre-wrap font-medium">${_escapeHtml(el.desc || _t('quality.etalon.viewer.no_desc', 'Нет описания'))}</div>
                ${photoHtml}
            </div>
        `;
      }

      const bodyHtml = `
        <div class="text-center mb-4 border-b border-surface pb-4">
            <div class="text-rbi-body font-bold text-muted uppercase leading-tight mb-0.5">${_escapeHtml(record.projectName || _t('quality.etalon.viewer.no_project', 'Без проекта'))}</div>
            <div class="text-rbi-title font-black text-ink uppercase leading-tight mb-1">${_escapeHtml(record.contractorName)}</div>
            <div class="text-rbi-label font-bold text-brand mt-0.5">${_escapeHtml(record.templateTitle)}</div>
            <div class="text-rbi-caption font-bold text-muted mt-1 uppercase tracking-widest">${new Date(record.date).toLocaleString('ru-RU')}</div>
        </div>

        <div class="grid grid-cols-2 gap-2 mb-4">
            <div class="bg-surface p-2.5 border border-surface rounded-xl shadow-sm">
                <div class="text-rbi-caption font-bold text-muted uppercase tracking-widest">${_t('quality.etalon.viewer.location', 'Локация')}</div>
                <div class="text-rbi-label font-bold text-ink mt-0.5">${_escapeHtml(record.location || '-')}</div>
            </div>
            <div class="bg-surface p-2.5 border border-surface rounded-xl shadow-sm">
                <div class="text-rbi-caption font-bold text-muted uppercase tracking-widest">${_t('quality.etalon.viewer.participants', 'Участники')}</div>
                <div class="text-rbi-label font-bold text-ink mt-0.5 whitespace-pre-wrap">${_escapeHtml(_formatEtalonParticipantsText(d.participants) || '-')}</div>
            </div>
        </div>

        <div class="bg-${!_isDefaultDeviations(d.deviations) ? 'orange' : 'green'}-50 p-3 rounded-xl border border-${!_isDefaultDeviations(d.deviations) ? 'orange' : 'green'}-200 mb-4">
            <div class="text-rbi-caption font-black uppercase text-${!_isDefaultDeviations(d.deviations) ? 'orange' : 'green'}-700 mb-1 tracking-widest">${_t('quality.etalon.viewer.deviations_title', 'Отклонения и допущения:')}</div>
            <div class="text-rbi-label font-medium text-${!_isDefaultDeviations(d.deviations) ? 'orange' : 'green'}-900 whitespace-pre-wrap">${_escapeHtml(d.deviations)}</div>
        </div>

        <h3 class="text-rbi-label font-black text-muted uppercase tracking-widest mb-3 border-b border-surface pb-2">${_t('quality.etalon.viewer.elements_title', 'Зафиксированные элементы')}</h3>
        ${elementsHtml}
      `;

      document.getElementById('etalon-view-body').innerHTML = bodyHtml;
      // Если прикреплен PDF, выводим кнопку для его открытия
      if (d.pdfData) {
        const pdfBtnHtml = `
            <div class="mt-4 p-3 bg-danger-soft border border-danger-soft rounded-xl flex justify-between items-center cursor-pointer active:scale-95 transition-transform" onclick="document.getElementById('etalon-view-modal').style.display='none'; document.body.classList.remove('modal-open'); setTimeout(() => { window.openFakePdfViewer('${d.pdfData}', '${d.pdfName}'); }, 300);">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 bg-danger-soft text-danger rounded-lg flex items-center justify-center font-black">PDF</div>
                    <div>
                        <div class="text-rbi-label font-bold text-ink">${d.pdfName}</div>
                        <div class="text-rbi-caption text-muted">${_t('quality.etalon.viewer.external_act', 'Внешний Акт-Эталон')}</div>
                    </div>
                </div>
                <span class="text-rbi-caption font-bold text-danger bg-surface px-2 py-1 rounded border border-danger-soft">${_t('quality.etalon.btn.open', 'Открыть')}</span>
            </div>
        `;
        document.getElementById('etalon-view-body').insertAdjacentHTML('beforeend', pdfBtnHtml);
      }

      // БЕЗОПАСНАЯ ВСТАВКА 3-Х КНОПОК (БЕЗ ОШИБКИ НА ВТОРОЙ КЛИК)
      const footerDiv = document.getElementById('etalon-view-body').nextElementSibling;
      if (footerDiv) {
        footerDiv.innerHTML = `
            <div class="flex gap-2 w-full flex-wrap">
                <button onclick="editEtalonAct('${id}')" class="flex-1 min-w-[100px] bg-brand-soft text-brand border border-brand-soft py-3.5 rounded-xl font-black text-rbi-label uppercase tracking-widest shadow-sm active:scale-95">✏️ ${_t('quality.etalon.btn.edit', 'Изменить')}</button>
                <button onclick="document.getElementById('etalon-view-modal').style.display='none'; document.body.classList.remove('modal-open'); printEtalonAct('${id}');" class="flex-1 min-w-[90px] bg-brand text-white py-3.5 rounded-xl font-black text-rbi-label uppercase tracking-widest shadow-md active:scale-95">🖨️ ${_t('quality.etalon.btn.pdf', 'PDF')}</button>
                <button onclick="document.getElementById('etalon-view-modal').style.display='none'; document.body.classList.remove('modal-open'); if(window.rbi_exportEtalonDocx) rbi_exportEtalonDocx('${id}');" class="flex-1 min-w-[90px] bg-sky-600 text-white py-3.5 rounded-xl font-black text-rbi-label uppercase tracking-widest shadow-md active:scale-95">${_t('quality.etalon.btn.word', 'Word')}</button>
                <button onclick="deleteEtalonAct('${id}')" class="bg-danger-soft text-danger border border-danger-soft px-4 py-3.5 rounded-xl font-black text-lg active:scale-95 shadow-sm">🗑️</button>
            </div>
        `;
      }

      const modal = document.getElementById('etalon-view-modal');
      modal.style.display = 'flex';
      document.body.classList.add('modal-open');
    },

    // =====================================================================
    // УДАЛЕНИЕ АКТА-ЭТАЛОНА
    // Перенесено из etalon.js (было window.deleteEtalonAct, строка 435).
    // =====================================================================
    deleteAct: async function (id) {
      const etalonActs3 = _etalonActs();
      const record = etalonActs3.find(c => String(c.id) === String(id));
      // Проверяем права по owner или по inspectorName
      var permSvc = (EtalonActions._ctx && EtalonActions._ctx.permissions) || (window.RBI && window.RBI.services && window.RBI.services.permissions);
      if (record && permSvc && !permSvc.canDelete(record, 'etalon')) return showToast(_t('quality.etalon.toast.no_delete_permission', '⚠️ Нет прав на удаление чужого эталона!'));

      if (!confirm(_t('quality.etalon.confirm.delete', 'Удалить этот Акт-Эталон?'))) return;
      if (record) {
        record._deleted = true;
        record.is_deleted = true; // ЖЕСТКИЙ ФЛАГ ДЛЯ ОБЛАКА
        record.updatedAt = new Date().toISOString();
        record.updated_at = record.updatedAt;

        // Переводим в статус "Не синхронизировано", чтобы улетело в облако
        record.source = 'local';
        record.syncStatus = 'not_synced';
        record.sync_status = 'not_synced';

        await _storage().put(_storage().stores().ETALON_ACTS, record);

        // ЖЕСТКАЯ ОЧИСТКА МАССИВА В ОЗУ ДЛЯ МГНОВЕННОГО ОБНОВЛЕНИЯ ЭКРАНА
        // Мутация на месте (не переприсваивание) — сохраняет живую ссылку,
        // на которую полагается EtalonState.getActs() (по прецеденту reportsArray).
        var filtered = etalonActs3.filter(function (e) { return !e._deleted; });
        etalonActs3.length = 0;
        Array.prototype.push.apply(etalonActs3, filtered);

        localStorage.setItem('rbi_cloud_dirty', '1');
        _triggerSync('silent');
      }
      document.getElementById('etalon-view-modal').style.display = 'none';
      document.body.classList.remove('modal-open');
      showToast(_t('quality.etalon.toast.deleted', '🗑️ Эталон удален'));

      // Обновляем экраны (Теперь эталоны живут в Практиках)
      if (typeof rbi_renderPracticesTab === 'function') rbi_renderPracticesTab();
      if (typeof renderHistoryTab === 'function') renderHistoryTab();

      emit('etalon:act:deleted', { id: id });
    },

    // =====================================================================
    // РЕДАКТИРОВАНИЕ АКТА-ЭТАЛОНА
    // Перенесено из etalon.js (было window.editEtalonAct, строка 469).
    // =====================================================================
    editAct: async function (id) {
      document.getElementById('etalon-view-modal').style.display = 'none';
      const record = _etalonActs().find(c => String(c.id) === String(id));
      if (!record) return;

      window.currentEditingEtalonId = id; // Глобально запоминаем ID
      window._rbiEtalonSkipDraft = true; // не предлагать локальный черновик нового акта
      EtalonActions.openConstructor(record.contractorName, record.templateKey, record.templateTitle, record.projectName, null);

      // Заполняем поля
      document.getElementById('etalon-location').value = record.location || '';
      const editParticipantsList = document.getElementById('etalon-participants-list');
      if (editParticipantsList) {
        // Легаси-записи хранят participants строкой — оборачиваем в один ряд,
        // ничего не теряя (см. _normalizeEtalonParticipants).
        const normalized = _normalizeEtalonParticipants(record.details.participants);
        editParticipantsList.innerHTML = normalized.length
          ? normalized.map(_renderEtalonParticipantRowHtml).join('')
          : _renderEtalonParticipantRowHtml();
      }
      document.getElementById('etalon-deviations').value = record.details.deviations || '';

      // Очищаем и заполняем элементы
      document.getElementById('etalon-elements-container').innerHTML = '';
      _elementCounter = 0;

      for (let el of record.details.elements) {
        EtalonActions.addElement();
        const elId = `etalon-el-${_elementCounter}`;
        const node = document.getElementById(elId);
        node.querySelector('.etalon-el-name').value = el.name || '';
        node.querySelector('.etalon-el-desc').value = el.desc || '';

        const photos = EtalonActions._photosFromElementData(el);
        if (photos.length) {
          await EtalonActions._renderElementPhotos(elId, photos);
        }
      }
    },

    // =====================================================================
    // ЗАГРУЗКА ГОТОВОГО PDF-АКТА
    // Перенесено из etalon.js (было window.handleEtalonPdfUpload, строка 506).
    // =====================================================================
    handlePdfUpload: function (event) {
      const file = event.target.files[0];
      if (!file) return;
      if (file.size > 15 * 1024 * 1024) { event.target.value = ''; return showToast(_t('quality.etalon.toast.file_too_large', 'Файл слишком большой! Максимум 15 МБ.')); }

      showToast(_t('quality.etalon.toast.saving_pdf', '⚙️ Сохранение PDF...'));
      const reader = new FileReader();
      reader.onload = async function (e) {
        const localUrl = await PhotoManager.saveLocal(e.target.result, 'etalon_pdf');

        const cont = document.getElementById('etalon-pdf-preview');
        cont.dataset.pdf = localUrl;
        document.getElementById('etalon-pdf-name').innerText = file.name;

        cont.classList.remove('hidden');
        document.getElementById('etalon-pdf-upload-btn').classList.add('hidden');
        event.target.value = '';
        if (window.RBIFormDraft && !window.currentEditingEtalonId) {
          window.RBIFormDraft.saveNow(window.RBIFormDraft.KEYS.ETALON_NEW, function () {
            return EtalonActions._collectNewDraft();
          });
        }
      };
      reader.readAsDataURL(file);
    },

    // =====================================================================
    // УДАЛЕНИЕ ПРИКРЕПЛЁННОГО PDF
    // Перенесено из etalon.js (было window.removeEtalonPdf, строка 527).
    // =====================================================================
    removePdf: function () {
      const cont = document.getElementById('etalon-pdf-preview');
      cont.dataset.pdf = '';
      cont.classList.add('hidden');
      document.getElementById('etalon-pdf-upload-btn').classList.remove('hidden');
    },

    /**
     * Синхронизирует состояние из legacy-переменных.
     */
    syncFromLegacy: function () {
      if (window.EtalonState) {
        window.EtalonState.syncFromLegacy();
      }
    }
  };

  window.EtalonActions = EtalonActions;

  // =========================================================================
  // РАЗМЕТКА МОДАЛКИ ETALON-VIEW (перенос из index.html:2045-2081, перенос
  // 30 modal/overlay-блоков #app-modals в JS-рендер). HTML-строка 1:1
  // идентична прежней статичной разметке.
  // =========================================================================
  function renderEtalonViewModalMarkup() {
    return `
    <div id="etalon-view-modal"
        class="fixed inset-0 bg-surface/80 z-[7000] hidden items-center justify-center p-2 sm:p-4 backdrop-blur-sm"
        onclick="this.style.display='none'; document.body.classList.remove('modal-open');">
        <div class="bg-[var(--card-bg)] w-full max-w-2xl max-h-[95vh] rounded-2xl shadow-2xl border border-[var(--card-border)] flex flex-col overflow-hidden"
            onclick="event.stopPropagation()">
            <div
                class="p-4 border-b border-[var(--card-border)] bg-[var(--hover-bg)] flex justify-between items-center shrink-0">
                <div
                    class="font-black text-rbi-body uppercase tracking-tight text-ink flex items-center gap-2">
                    <svg class="w-5 h-5 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24"
                        stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round"
                            d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z">
                        </path>
                    </svg>
                    ${_t('quality.etalon.title.act', 'Акт-Эталон')}
                </div>
                <button
                    onclick="document.getElementById('etalon-view-modal').style.display='none'; document.body.classList.remove('modal-open');"
                    class="w-8 h-8 bg-surface rounded-full flex items-center justify-center text-muted active:scale-90 shadow-sm border border-surface">✕</button>
            </div>
            <div id="etalon-view-body" class="p-4 overflow-y-auto custom-scrollbar flex-1 space-y-4">
                <!-- Контент генерируется JS -->
            </div>
            <div class="p-4 border-t border-[var(--card-border)] bg-surface shrink-0">
                <button id="etalon-view-print-btn"
                    class="w-full bg-brand text-white py-3.5 rounded-xl font-black text-rbi-body uppercase tracking-widest shadow-md active:scale-95 flex items-center justify-center gap-2">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round"
                            d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z">
                        </path>
                    </svg>
                    ${_t('quality.etalon.btn.download_print', 'Скачать / Распечатать (PDF)')}
                </button>
            </div>
        </div>
    </div>
`;
  }

  (function mountEtalonViewModalMarkup() {
    var root = window.RBI && window.RBI.services && window.RBI.services.shell
      ? window.RBI.services.shell.getModalsRoot()
      : document.getElementById('app-modals');
    if (!root) return;
    if (!document.getElementById('etalon-view-modal')) {
      root.insertAdjacentHTML('beforeend', renderEtalonViewModalMarkup());
    }
  }());

  // =========================================================================
  // WINDOW-ПРОКСИ (обратная совместимость: index.html inline-обработчики,
  // динамически генерируемый HTML, knowledge.legacy.js, interventions.js,
  // history.render.js, tasks.module.js, audit.actions.js:722).
  // =========================================================================
  window.openEtalonConstructor    = EtalonActions.openConstructor.bind(EtalonActions);
  window.closeEtalonConstructor   = EtalonActions.closeConstructor.bind(EtalonActions);
  window.addEtalonElement         = EtalonActions.addElement.bind(EtalonActions);
  window.triggerEtalonPhotoUpload = EtalonActions.triggerPhotoUpload.bind(EtalonActions);
  window.saveEtalonMarkupPhoto    = EtalonActions.saveMarkupPhoto.bind(EtalonActions);
  window.removeEtalonPhoto        = EtalonActions.removePhotoEl.bind(EtalonActions);
  window.saveEtalonAct            = EtalonActions.saveAct.bind(EtalonActions);
  window.openEtalonViewer         = EtalonActions.openViewer.bind(EtalonActions);
  window.deleteEtalonAct          = EtalonActions.deleteAct.bind(EtalonActions);
  window.editEtalonAct            = EtalonActions.editAct.bind(EtalonActions);
  window.handleEtalonPdfUpload    = EtalonActions.handlePdfUpload.bind(EtalonActions);
  window.removeEtalonPdf          = EtalonActions.removePdf.bind(EtalonActions);
  window.rbi_addEtalonParticipantRow    = _addEtalonParticipantRow;
  window.rbi_removeEtalonParticipantRow = _removeLastEtalonParticipantRow;

  console.log('[EtalonActions] etalon.actions.js loaded (owner-module: full business logic)');
}());
