chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.set({
    sharpenStrength: 0.5,
    enabled: true
  });
});
