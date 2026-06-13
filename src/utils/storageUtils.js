const STORAGE_KEY = 'gpxFiles';

export const loadSavedGpxList = () => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch (e) {
    console.error('Failed to load GPX files from localStorage', e);
    return {};
  }
};

export const saveGpx = (name, data) => {
  const savedFiles = loadSavedGpxList();
  savedFiles[name] = data;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(savedFiles));
  return savedFiles;
};

export const deleteGpx = (name) => {
  const savedFiles = loadSavedGpxList();
  delete savedFiles[name];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(savedFiles));
  return savedFiles;
};
