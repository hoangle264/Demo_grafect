"use strict";

// ═══════════════════════════════════════════════════════════════════════════════
//  TEMPLATE MANAGER — Dynamic .hbs template loader
//
//  Allows users to load custom .hbs files from their computer to override
//  the default code generation templates for any PLC target.
//
//  localStorage keys: custom_tpl_<filename>  (e.g. custom_tpl_kv_main.hbs)
//
//  Template classification:
//    kv_main.hbs, kv_step.hbs       → KV5500 / KV mnemonic generator
//    auto.hbs, manual.hbs,
//    step-body.hbs, error.hbs,
//    origin.hbs, output.hbs,
//    main-output.hbs                → Unit Config JSON generator
//    st_main.hbs                    → Structured Text generator
//
//  Files whose name contains "body" or "partial" are also registered as
//  Handlebars partials so other templates can call {{> name}}.
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Return the custom template string stored for the given filename,
 * or null if no custom template has been loaded.
 * @param {string} filename  e.g. 'auto.hbs'
 * @returns {string|null}
 */
function tmGetCustomTemplate(filename) {
  return localStorage.getItem('custom_tpl_' + filename);
}

/**
 * Save a custom template string for the given filename.
 * @param {string} filename
 * @param {string} src
 */
function tmSetCustomTemplate(filename, src) {
  localStorage.setItem('custom_tpl_' + filename, src);
}

/**
 * Remove the custom template for the given filename (revert to default).
 * @param {string} filename
 */
function tmResetTemplate(filename) {
  localStorage.removeItem('custom_tpl_' + filename);
}

/**
 * Return a list of all currently loaded custom template filenames.
 * @returns {string[]}
 */
function tmListCustomTemplates() {
  const results = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith('custom_tpl_')) {
      results.push(key.slice('custom_tpl_'.length));
    }
  }
  return results;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Validate that a string is a compilable Handlebars template.
 * Returns null if valid, or an error message string if invalid.
 * @param {string} src
 * @returns {string|null}
 */
function tmValidateTemplate(src) {
  if (typeof Handlebars === 'undefined') return null; // can't validate without Handlebars
  try {
    Handlebars.compile(src);
    return null;
  } catch (e) {
    return e.message || String(e);
  }
}

/**
 * If the filename contains "body" or "partial", register/update the
 * Handlebars partial for that name (derived from the filename without .hbs).
 * @param {string} filename
 * @param {string} src
 */
function tmMaybeRegisterPartial(filename, src) {
  if (typeof Handlebars === 'undefined') return;
  const base = filename.replace(/\.hbs$/i, '');
  // Normalise: replace hyphens with underscores for partial names
  const partialName = base.replace(/-/g, '_');
  if (base.toLowerCase().includes('body') || base.toLowerCase().includes('partial')) {
    Handlebars.registerPartial(partialName, src);
  }
}

// ─── File loading ─────────────────────────────────────────────────────────────

/**
 * Handle a FileList (from an <input type="file"> change event).
 * Reads each .hbs file using FileReader, validates it, saves to localStorage,
 * and refreshes the Template Manager UI.
 *
 * @param {FileList} files
 */
function tmHandleFileUpload(files) {
  if (!files || !files.length) return;
  Array.from(files).forEach(function(file) {
    if (!file.name.endsWith('.hbs')) return;
    const reader = new FileReader();
    reader.onload = function(e) {
      const src = e.target.result;
      const err = tmValidateTemplate(src);
      if (err) {
        // Show a safe, truncated error message; log the full message for debugging
        console.warn('[template-manager] syntax error in', file.name, ':', err);
        toast('⚠ Template "' + escHtml(file.name) + '" có lỗi cú pháp. Xem console để biết chi tiết.');
        return;
      }
      tmSetCustomTemplate(file.name, src);
      tmMaybeRegisterPartial(file.name, src);
      toast('✓ Đã nạp template: ' + file.name);
      tmRenderManagerList();
      // Re-apply to UC_TEMPLATE_CACHE so the next preview reflects the change
      tmApplyCustomTemplatesToCache();
      if (typeof cgUpdatePreview === 'function') cgUpdatePreview();
    };
    reader.readAsText(file);
  });
}

// ─── Apply custom templates to cache ─────────────────────────────────────────

// Mapping: filename → UC_TEMPLATE_CACHE key
const TM_UC_FILE_MAP = {
  'auto.hbs':        'auto',
  'manual.hbs':      'manual',
  'error.hbs':       'error',
  'origin.hbs':      'origin',
  'output.hbs':      'output',
  'main-output.hbs': 'main-output',
  'step-body.hbs':   null,  // handled as partial only
};

// Mapping: filename → UC_PARTIAL_BUNDLE key / Handlebars partial name
const TM_UC_PARTIAL_MAP = {
  'step-body.hbs': 'step_body',
};

/**
 * Apply all custom templates currently in localStorage to:
 *   - UC_TEMPLATE_CACHE (for unit-config generator)
 *   - Handlebars partials
 */
function tmApplyCustomTemplatesToCache() {
  if (typeof Handlebars === 'undefined') return;
  if (typeof UC_TEMPLATE_CACHE === 'undefined') return;

  // Ensure helpers are registered
  if (typeof ucRegisterHandlebarsHelpers === 'function') {
    ucRegisterHandlebarsHelpers();
  }

  const loaded = tmListCustomTemplates();
  loaded.forEach(function(filename) {
    const src = tmGetCustomTemplate(filename);
    if (!src) return;

    // Register as partial if applicable
    tmMaybeRegisterPartial(filename, src);

    // Also check the explicit partial map
    const partialName = TM_UC_PARTIAL_MAP[filename];
    if (partialName) {
      Handlebars.registerPartial(partialName, src);
    }

    // Update UC_TEMPLATE_CACHE if it's a main template
    const cacheKey = TM_UC_FILE_MAP[filename];
    if (cacheKey) {
      try {
        UC_TEMPLATE_CACHE[cacheKey] = Handlebars.compile(src);
      } catch (e) {
        console.warn('[template-manager] compile error for', filename, e);
      }
    }
  });
}

// ─── UI: Template Manager panel ───────────────────────────────────────────────

/**
 * Render (or re-render) the list of loaded custom templates inside
 * the #tpl-manager-list element.
 */
function tmRenderManagerList() {
  const list = document.getElementById('tpl-manager-list');
  if (!list) return;
  const loaded = tmListCustomTemplates();
  if (!loaded.length) {
    list.innerHTML = '<span style="font-size:9px;color:var(--text3)">Chưa có template tùy chỉnh nào.</span>';
    return;
  }
  list.innerHTML = '';
  loaded.sort().forEach(function(filename) {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:4px;';

    const nameSpan = document.createElement('span');
    nameSpan.style.cssText = 'font-size:10px;color:var(--cyan);font-family:\'JetBrains Mono\',monospace;';
    nameSpan.textContent = filename;

    const descSpan = document.createElement('span');
    descSpan.style.cssText = 'flex:1;font-size:9px;color:var(--text3);';
    descSpan.textContent = tmDescribeFile(filename);

    const btn = document.createElement('button');
    btn.className = 'btn';
    btn.style.cssText = 'padding:1px 7px;font-size:9px;';
    btn.textContent = '↺ Reset';
    btn.dataset.filename = filename;
    btn.addEventListener('click', function() {
      tmResetAndRefresh(this.dataset.filename);
    });

    row.appendChild(nameSpan);
    row.appendChild(descSpan);
    row.appendChild(btn);
    list.appendChild(row);
  });
}

/**
 * Reset a custom template and refresh the UI + preview.
 * @param {string} filename
 */
function tmResetAndRefresh(filename) {
  tmResetTemplate(filename);
  // Restore default for this key in UC_TEMPLATE_CACHE from bundle
  const cacheKey = TM_UC_FILE_MAP[filename];
  if (cacheKey && typeof UC_TEMPLATE_BUNDLE !== 'undefined' && typeof UC_TEMPLATE_CACHE !== 'undefined') {
    const defaultSrc = UC_TEMPLATE_BUNDLE[cacheKey];
    if (defaultSrc) {
      UC_TEMPLATE_CACHE[cacheKey] = Handlebars.compile(defaultSrc);
    } else {
      delete UC_TEMPLATE_CACHE[cacheKey];
    }
  }
  // Restore default partial
  const partialName = TM_UC_PARTIAL_MAP[filename];
  if (partialName && typeof UC_PARTIAL_BUNDLE !== 'undefined') {
    const defaultPartial = UC_PARTIAL_BUNDLE[partialName];
    if (defaultPartial) Handlebars.registerPartial(partialName, defaultPartial);
  }
  toast('↺ Đã khôi phục template mặc định: ' + filename);
  tmRenderManagerList();
  if (typeof cgUpdatePreview === 'function') cgUpdatePreview();
}

/**
 * Return a human-readable description for a template filename.
 * @param {string} filename
 * @returns {string}
 */
function tmDescribeFile(filename) {
  const kvFiles = ['kv_main.hbs', 'kv_step.hbs'];
  const ucFiles = ['auto.hbs', 'manual.hbs', 'step-body.hbs', 'error.hbs', 'origin.hbs', 'output.hbs', 'main-output.hbs'];
  const stFiles = ['st_main.hbs'];
  if (kvFiles.includes(filename)) return '→ KV5500 Mnemonic';
  if (ucFiles.includes(filename)) return '→ Unit Config JSON';
  if (stFiles.includes(filename)) return '→ Structured Text';
  return '→ Custom';
}

// ─── Small HTML escape helpers ────────────────────────────────────────────────

function escHtml(s) {
  return String(s).replace(/[&<>"']/g, function(c) {
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
  });
}

// ─── Boot: apply any templates saved in localStorage on page load ─────────────
// Runs after UC_TEMPLATE_CACHE is available (this script loads after
// templates-bundle.js and unit-config.js in index.html).
(function tmBoot() {
  // Defer until the rest of the page scripts have run.
  // Using a zero-timeout ensures UC_TEMPLATE_CACHE is defined.
  setTimeout(function() {
    tmApplyCustomTemplatesToCache();
  }, 0);
})();
