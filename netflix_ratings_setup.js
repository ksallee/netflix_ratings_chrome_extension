async function fetchJSON(url) {
  const response = await fetch(url);

  return response.status;
}


function saveSettings() {
    let tmdbApiKey = document.getElementById('tmdbApiKey').value
    let omdbApiKey = document.getElementById('omdbApiKey').value
    let status = document.getElementById('status');
    chrome.storage.sync.set({
        netflixMediaRatingsTmdbApiKey: tmdbApiKey,
        netflixMediaRatingsOmdbApiKey: omdbApiKey
    }, async function() {
        let errors = []
        let omdbUrl = `https://www.omdbapi.com/?t=foo&apikey=${omdbApiKey}`
        let omdbStatus = await fetchJSON(omdbUrl)
        if (omdbStatus !== 200) errors.push("Invalid OMDB API key")
        let tmdbUrl = `https://api.themoviedb.org/3/configuration?api_key=${tmdbApiKey}`
        let tmdbStatus = await fetchJSON(tmdbUrl)
        if (tmdbStatus !== 200) errors.push("Invalid TMDB API key")
        if (errors.length !== 0){
            status.textContent = errors.join(", ")
            status.className = "error"
            chrome.runtime.sendMessage({
                action: 'setDisabledIcon',
                value: true
            });
            return
        }
        // Update status to let user know options were saved.
        status.textContent = 'API keys saved.';
        status.className = "success"
        chrome.runtime.sendMessage({
            action: 'setDisabledIcon',
            value: false
        });
        setTimeout(
    function() {
                status.textContent = '';
            },
    1000
        );
    });
}

function restoreSettings() {
    chrome.storage.sync.get(
        ["netflixMediaRatingsTmdbApiKey", "netflixMediaRatingsOmdbApiKey"],
        function(items) {
            if (items.netflixMediaRatingsTmdbApiKey !== undefined){
                document.getElementById('tmdbApiKey').value = items.netflixMediaRatingsTmdbApiKey;
                document.getElementById('omdbApiKey').value = items.netflixMediaRatingsOmdbApiKey;
            }
        }
    );
}

document.addEventListener('DOMContentLoaded', restoreSettings);
document.getElementById('save').addEventListener('click', saveSettings);