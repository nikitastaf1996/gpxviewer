const STORAGE_KEY = 'gpxFiles';

export function getSavedFiles() {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
}

export function saveFile(name, data) {
    const savedFiles = getSavedFiles();
    savedFiles[name] = data;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(savedFiles));
    return savedFiles;
}

export function deleteFile(name) {
    const savedFiles = getSavedFiles();
    delete savedFiles[name];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(savedFiles));
    return savedFiles;
}
