export const TRANSPARENCY_STORAGE_KEY = 'livestocks-reduce-transparency';
export const TRANSPARENCY_QUERY = '(prefers-reduced-transparency: reduce)';

// Runs before the page paints, alongside next-themes' color-scheme script.
export const transparencyInitScript = `(function(){var reduced=false;try{reduced=localStorage.getItem('${TRANSPARENCY_STORAGE_KEY}')==='true'}catch(e){}try{reduced=reduced||window.matchMedia('${TRANSPARENCY_QUERY}').matches}catch(e){}document.documentElement.setAttribute('data-reduce-transparency',String(reduced))})()`;
