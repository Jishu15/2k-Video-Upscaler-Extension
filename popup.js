const enableToggle = document.getElementById('enableToggle');
const sharpnessInput = document.getElementById('sharpness');
const sharpnessVal = document.getElementById('sharpnessVal');
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const videoCount = document.getElementById('videoCount');

// Load settings
chrome.storage.sync.get(['sharpenStrength', 'enabled'], (data) => {
  const enabled = data.enabled ?? true;
  enableToggle.textContent = enabled ? 'On' : 'Off';
  enableToggle.className = 'toggle-btn ' + (enabled ? 'on' : 'off');

  const val = Math.round((data.sharpenStrength ?? 0.5) * 100);
  sharpnessInput.value = val;
  sharpnessVal.textContent = val + '%';
});

enableToggle.addEventListener('click', () => {
  const enabled = !enableToggle.textContent.includes('On');
  enableToggle.textContent = enabled ? 'On' : 'Off';
  enableToggle.className = 'toggle-btn ' + (enabled ? 'on' : 'off');
  chrome.storage.sync.set({ enabled });

  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    if (tab?.id) {
      chrome.tabs.sendMessage(tab.id, {
        type: 'setEnabled',
        value: enabled
      }).catch(() => {});
    }
  });
});

sharpnessInput.addEventListener('input', () => {
  const val = parseInt(sharpnessInput.value);
  sharpnessVal.textContent = val + '%';
  chrome.storage.sync.set({ sharpenStrength: val / 100 });

  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    if (tab?.id) {
      chrome.tabs.sendMessage(tab.id, {
        type: 'setSharpness',
        value: val / 100
      }).catch(() => {});
    }
  });
});

// Query active tab for status
chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
  if (!tab?.id) return;
  chrome.tabs.sendMessage(tab.id, { type: 'getStatus' }).then((res) => {
    if (res) {
      if (!res.enabled) {
        statusDot.className = 'status-dot inactive';
        statusText.textContent = 'Extension off';
        videoCount.textContent = '-';
        return;
      }
      const up = res.count || 0;
      const det = res.detected || 0;
      statusDot.className = 'status-dot ' + (up > 0 ? 'active' : 'inactive');
      if (up > 0) {
        statusText.textContent = up + ' video' + (up > 1 ? 's' : '') + ' upscaled';
      } else if (det > 0) {
        statusText.textContent = det + ' video' + (det > 1 ? 's' : '') + ' detected (not 720p/1080p)';
      } else {
        statusText.textContent = 'No videos found';
      }
      videoCount.textContent = up;
    }
  }).catch(() => {
    statusText.textContent = 'Extension ready';
    videoCount.textContent = '-';
  });
});
