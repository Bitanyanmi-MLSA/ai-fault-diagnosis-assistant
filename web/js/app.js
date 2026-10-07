(() => {
  'use strict';

  const STORAGE_KEY = 'aifda_api_base_url';
  // Default deployed Azure Function endpoint — can be overridden via the Settings dialog.
  const DEFAULT_API_BASE_URL = 'https://func-api-my2mpu7rmte6m.azurewebsites.net';

  let knowledgeBase = [];
  let selectedImageDataUrl = null; // data URL (base64) ready to send
  let selectedMimeType = null;

  const el = (id) => document.getElementById(id);

  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    try {
      const res = await fetch('data/knowledge-base.json');
      knowledgeBase = await res.json();
    } catch (err) {
      console.error('Failed to load knowledge base', err);
      knowledgeBase = [];
    }

    renderKbList();
    wireEvents();
    loadSettings();
  }

  function wireEvents() {
    el('fileInput').addEventListener('change', onFileSelected);
    el('clearMediaBtn').addEventListener('click', clearMedia);
    el('diagnoseBtn').addEventListener('click', onDiagnoseClick);
    el('settingsBtn').addEventListener('click', () => el('settingsDialog').showModal());
    el('settingsForm').addEventListener('submit', (e) => {
      if (e.submitter && e.submitter.id === 'saveSettingsBtn') {
        localStorage.setItem(STORAGE_KEY, el('apiBaseUrl').value.trim());
      }
    });
  }

  function loadSettings() {
    const saved = localStorage.getItem(STORAGE_KEY) || DEFAULT_API_BASE_URL;
    el('apiBaseUrl').value = saved;
    if (!localStorage.getItem(STORAGE_KEY)) {
      localStorage.setItem(STORAGE_KEY, DEFAULT_API_BASE_URL);
    }
  }

  function getApiBaseUrl() {
    return (localStorage.getItem(STORAGE_KEY) || DEFAULT_API_BASE_URL).replace(/\/+$/, '');
  }

  // ---------- Media handling ----------

  function onFileSelected(e) {
    const file = e.target.files[0];
    if (!file) return;

    clearMedia(false);
    el('previewWrap').classList.remove('hidden');

    if (file.type.startsWith('video/')) {
      const video = el('videoPreview');
      video.src = URL.createObjectURL(file);
      video.classList.remove('hidden');
      video.addEventListener('loadeddata', () => captureFrameFromVideo(video), { once: true });
    } else {
      const reader = new FileReader();
      reader.onload = () => {
        selectedImageDataUrl = reader.result;
        selectedMimeType = file.type || 'image/jpeg';
        el('imagePreview').src = selectedImageDataUrl;
        el('imagePreview').classList.remove('hidden');
      };
      reader.readAsDataURL(file);
    }
  }

  function captureFrameFromVideo(video) {
    // Seek a little into the clip so we don't grab a black first frame
    const seekTo = Math.min(1, (video.duration || 1) / 2);
    const grab = () => {
      const canvas = el('frameCanvas');
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 360;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      selectedImageDataUrl = canvas.toDataURL('image/jpeg', 0.85);
      selectedMimeType = 'image/jpeg';
    };
    if (video.seekable && video.seekable.length) {
      video.currentTime = seekTo;
      video.addEventListener('seeked', grab, { once: true });
    } else {
      grab();
    }
  }

  function clearMedia(resetInput = true) {
    selectedImageDataUrl = null;
    selectedMimeType = null;
    el('imagePreview').src = '';
    el('imagePreview').classList.add('hidden');
    el('videoPreview').src = '';
    el('videoPreview').classList.add('hidden');
    el('previewWrap').classList.add('hidden');
    if (resetInput) el('fileInput').value = '';
  }

  // ---------- Knowledge base matching ----------

  function renderKbList() {
    const list = el('kbList');
    list.innerHTML = '';
    knowledgeBase.forEach((entry) => {
      const div = document.createElement('div');
      div.className = 'kb-item';
      div.innerHTML = `
        <div class="plat">${escapeHtml(entry.platform)}</div>
        <h4>${escapeHtml(entry.title)}</h4>
        <div class="codes">${entry.codes.length ? 'Codes: ' + entry.codes.map(escapeHtml).join(', ') : ''}</div>
      `;
      div.addEventListener('click', () => showResult({ source: 'knowledge-base', confidence: 'high', ...entry }));
      list.appendChild(div);
    });
  }

  function findKbMatch(errorCode, symptoms) {
    const code = (errorCode || '').trim().toLowerCase();
    const text = `${errorCode || ''} ${symptoms || ''}`.toLowerCase();

    if (code) {
      const exact = knowledgeBase.find((e) => e.codes.some((c) => c.toLowerCase() === code));
      if (exact) return exact;
    }

    let best = null;
    let bestScore = 0;
    for (const entry of knowledgeBase) {
      let score = 0;
      for (const c of entry.codes) {
        if (code && (code.includes(c.toLowerCase()) || c.toLowerCase().includes(code))) score += 3;
      }
      for (const kw of entry.keywords || []) {
        if (text.includes(kw.toLowerCase())) score += 1;
      }
      if (score > bestScore) {
        bestScore = score;
        best = entry;
      }
    }
    return bestScore >= 2 ? best : null;
  }

  // ---------- Diagnose action ----------

  async function onDiagnoseClick() {
    const deviceType = el('deviceType').value;
    const errorCode = el('errorCode').value.trim();
    const symptoms = el('symptoms').value.trim();

    if (!errorCode && !symptoms && !selectedImageDataUrl) {
      setStatus('Please enter an error code/symptoms or attach a photo/video.');
      return;
    }

    // 1. Try instant knowledge-base match first (fast, free, works offline)
    const kbMatch = findKbMatch(errorCode, symptoms);
    if (kbMatch && !selectedImageDataUrl) {
      showResult({ source: 'knowledge-base', confidence: 'high', ...kbMatch });
      return;
    }

    // 2. Fall back to the AI API (needed when a photo was supplied, or no KB match)
    const apiBase = getApiBaseUrl();
    if (!apiBase) {
      if (kbMatch) {
        showResult({ source: 'knowledge-base', confidence: 'medium', ...kbMatch });
        return;
      }
      setStatus('⚠️ No API URL configured (⚙️ Settings) and no knowledge-base match found.');
      return;
    }

    setStatus('🔎 Analyzing with AI... this can take a few seconds.');
    el('diagnoseBtn').disabled = true;

    try {
      const res = await fetch(`${apiBase}/api/diagnose`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: selectedImageDataUrl,
          mimeType: selectedMimeType,
          errorCode,
          symptoms,
          deviceType,
        }),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || `API error (${res.status})`);
      }

      const data = await res.json();
      showResult(data);
      setStatus('');
    } catch (err) {
      console.error(err);
      setStatus(`❌ ${err.message || 'Could not reach the diagnosis API.'}`);
      if (kbMatch) {
        showResult({ source: 'knowledge-base', confidence: 'medium', ...kbMatch });
      }
    } finally {
      el('diagnoseBtn').disabled = false;
    }
  }

  function setStatus(text) {
    el('statusText').textContent = text;
  }

  function showResult(data) {
    const section = el('resultSection');
    section.classList.remove('hidden');
    el('resultTitle').textContent = data.title || 'Diagnosis';
    el('resultSource').textContent = data.source === 'ai' ? 'AI Vision' : 'Knowledge Base';

    const confidence = (data.confidence || 'medium').toLowerCase();
    const confEl = el('resultConfidence');
    confEl.className = `confidence ${confidence}`;
    confEl.textContent = `Confidence: ${confidence}`;

    const causes = data.likelyCauses || [];
    const steps = data.steps || [];
    const parts = data.partsOrToolsNeeded || [];
    const escalate = data.whenToEscalate || '';
    const safety = data.safetyNotes || '';

    el('resultBody').innerHTML = `
      ${causes.length ? `<h3>Likely cause(s)</h3><ul>${causes.map((c) => `<li>${escapeHtml(c)}</li>`).join('')}</ul>` : ''}
      ${steps.length ? `<h3>Steps to fix</h3><ul>${steps.map((s) => `<li>${escapeHtml(s)}</li>`).join('')}</ul>` : ''}
      ${parts.length ? `<h3>Parts / tools needed</h3><ul>${parts.map((p) => `<li>${escapeHtml(p)}</li>`).join('')}</ul>` : ''}
      ${escalate ? `<h3>When to escalate</h3><p>${escapeHtml(escalate)}</p>` : ''}
      ${safety ? `<div class="safety-note">⚠️ <strong>Safety:</strong> ${escapeHtml(safety)}</div>` : ''}
    `;

    section.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
})();
