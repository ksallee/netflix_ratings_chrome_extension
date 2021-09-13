let TMDB_API_KEY = ""
let OMDB_API_KEY = ""
const NB_DAYS_FOR_REFRESH = "1"


/**
 * Call callbackFunction when DOM is loaded.
 *
 * @param {domReadyCallback} callbackFunction The callback to call.
 */
function docReady(callbackFunction) {
    // see if DOM is already available
    if (document.readyState === "complete" || document.readyState === "interactive") {
        // call on next available tick
        setTimeout(callbackFunction, 1);
    } else {
        document.addEventListener("DOMContentLoaded", callbackFunction);
    }
}

/**
 * Used to call a function with an HTML element and a callback to observe changes
 * of the HTML element and call the callback when it changes.
 */
var observeDOM = (function(){
    let MutationObserver = window.MutationObserver || window.WebKitMutationObserver;
    return function( obj, callback ){
        if( !obj || obj.nodeType !== 1 ) return;

        if( MutationObserver ){
            // define a new observer
            let mutationObserver = new MutationObserver(callback)
            // have the observer observe for changes in children
            mutationObserver.observe( obj, { childList:true, subtree:true })
            return mutationObserver
        }
        // browser support fallback
        else if( window.addEventListener ){
            obj.addEventListener('DOMNodeInserted', callback, false)
            obj.addEventListener('DOMNodeRemoved', callback, false)
        }
    }
})()

/**
 * Fetch a JSON reply from a URL.
 *
 * @param {string} url A URL to an endpoint.
 * @returns {Promise<any>} A JSON dictionary
 * @throws Error If a problem happened when fetching the data.
 */
async function fetchJSON(url) {
  const response = await fetch(url);

  if (!response.ok) {
    const message = `An error has occured: ${response.status}`;
    throw new Error(message);
  }

  const result = await response.json();
  return result;
}

/**
 * Given a ratings object with ratings data from different sources (TMDB, Metacritic, IMDB),
 * Get a str representation of these ratings with possibly links to the potential site.
 * Add also classes that allow to show accurate/potentially inaccurate results in different colors.
 *
 * @param {string} title the Title of the media
 * @param {Object} ratings A ratings Object with IMDB, Meta and TMDB keys.
 * @returns {string}
 */
function getRatingsStr(title, ratings){
    let ratingsStrList = []
    let mediaType = ratings["media_type"]
    let className = (ratings["accurate_result"] === true)? "accurate": "inaccurate"
    for (let site of ["IMDB", "Meta", "TMDB"]){
        if (ratings[site] === undefined) continue
        let siteRatings = ratings[site]

        let count = siteRatings["count"]
        let rating = siteRatings["rating"]
        switch(site){
            case "IMDB":
                let imdbUrl = `https://imdb.com/title/${siteRatings["id"]}`
                let imdbText = `<a href="${imdbUrl}" title="Votes: ${count}" class="${className}" target="_blank" rel="noopener noreferrer">IMDB: ${rating}</a>`
                ratingsStrList.push(imdbText)
                break
            case "Meta":
                let metaUrl = `https://www.metacritic.com/search/${mediaType}/${encodeURIComponent(title)}/results`
                let metaText = `<a href="${metaUrl}" class="${className}" target="_blank" rel="noopener noreferrer">Meta: ${rating}</a>`
                ratingsStrList.push(metaText)
                break
            case "TMDB":
                let tmdbURL = `https://www.themoviedb.org/${siteRatings["media_type"]}/${siteRatings["id"]}`
                let tmdbText = `<a href="${tmdbURL}" title="Votes: ${count}" class="${className}" target="_blank" rel="noopener noreferrer">TMDB: ${rating}</a>`
                ratingsStrList.push(tmdbText)
                break
        }
    }
    return ratingsStrList.join(" ")
}

/**
 * Class to add ratings information from cached ratings into each thumbnail view
 * on a Netflix page (e.g. Home, Movies, TV..)
 *
 * Each thumbnail view does include the title of the media, but searching directly by
 * title is inaccurate. So data in a thumbnail is only displayed if it was already found
 * in the details page and cached.
 *
 * Known caveats: If two medias have exactly the same title, they would override each other's cache.
 */
class NetflixThumbnailView{
    /**
     * Construct a NetflixThumbnailView
     * @param {Object} cachedRatings Cached ratings for all titles.
     * @param {HTMLElement} titleContainer The container to add data to.
     */
    constructor(cachedRatings, titleContainer){
        this.cachedRatings = cachedRatings
        this.titleContainer = titleContainer
        // There's a container that contains the title of the media. Get that title.
        this.title = titleContainer.getElementsByClassName("fallback-text-container")[0].children[0].textContent
        // This will be set to the cached ratings for this title, if found.
        this.mediaRatings = undefined
    }

    /**
     * Try to get the ratings from the cache using the title. If found, add the ratings to the view.
     */
    fetchRatings(){
        // If there are no cached ratings, nothing we can do. It's the details view of some media
        // that provides enough information to search for some media information.
        if (this.cachedRatings == null || this.cachedRatings[this.title] == null) return
        this.mediaRatings = this.cachedRatings[this.title]
        this.addRatings()
    }

    /**
     * Add cached ratings to the thumbnail view, if not already present. It will include only ratings data of the sites
     * from which data was found (e.g. IMDB, TMDB, Metacritic) with some links to the respective sites, and will be shown
     * in orange if the results are potentially inaccurate.
     */
    addRatings() {
        let ratingStr = getRatingsStr(this.title, this.mediaRatings)
        // Rating is somehow in the cache but has no data. Should not be possible, but
        // just to be safe.
        if (ratingStr === "") return
        let existingRatingElements = this.titleContainer.getElementsByClassName("mainPageRating")
        // If we already added the ratings, nothing else to do.
        if (existingRatingElements.length > 0) return
        // Actually add a ratings element, with class mainPageRating to style them.
        let ratingElement = document.createElement("p")
        ratingElement.className = "mainPageRating"
        ratingElement.innerHTML=ratingStr
        this.titleContainer.appendChild(ratingElement)
    }
}

/**
 *  Class to add information to a media's detailed view. Either it's already cached, and the cache is used,
 *  or it's not cached, and information about the movie (mostly title and at least one person of interest,
 *  e.g. director, creator, cast member) is used to fetch data from TMDB and OMDB
 */
class NetflixDetailsView {
    /**
     * Construct a NetflixDetailsView
     * @param {Object} cachedRatings Cached ratings information for all media titles.
     * @param {HTMLElement} aboutWrapper The HTML element containing "About" information of the title (near the bottom)
     *                                   Note: we don't use the main details container since this class is called by observing
     *                                   the DOM and somehow it does not work by searching for the whole container.
     */
    constructor(cachedRatings, aboutWrapper){
        // The whole container of all the details
        this.detailsContainer = aboutWrapper.parentElement.parentElement.parentElement
        this.cachedRatings = cachedRatings
        let aboutHeader = aboutWrapper.getElementsByClassName("about-header")[0]
        this.title = aboutHeader.getElementsByTagName("strong")[0].textContent
        // The first element of the about container should be either the director or the cast.
        // But some media titles (e.g. documentaries) have neither.
        let aboutContainer = aboutWrapper.getElementsByClassName("about-container")[0]
        let aboutSpans = aboutContainer.getElementsByTagName("span")
        let personLabel = aboutSpans[0].textContent
        // Can be Creator or Director, and if not available, some cast member.
        let personOfInterest = undefined
        // Cast for actor, crew for director/creator
        let personType = "crew"
        if ( personLabel.includes("Creator") || personLabel.includes("Director")){
            personOfInterest = aboutSpans[1].textContent.trim().split(",")[0]
        }
        else if (personLabel.includes("Cast")){
            personOfInterest = aboutSpans[1].textContent.trim().split(",")[0]
            personType = "cast"
        }
        // At the top of the details view, get the media's year of release.
        let secondLineDetails = this.detailsContainer.getElementsByClassName("videoMetadata--second-line")[0]
        let year = secondLineDetails.getElementsByClassName("year")[0].textContent.trim()
        // Create instances of TMDBData and OMDBData to fetch the ratings, if not in the cache.
        // OMDBData relies on the IMDB id, the media type and if the result is potentially inaccurate,
        // which we get from TMDB, so initialize it without these values.
        this.tmdbData = new TMDBData(this.title, year, personOfInterest, personType)
        this.omdbData = new OmdbData(undefined)
        // The ratings object with ratings data for the media title.
        this.mediaRatings = undefined
    }

    /**
     * Fetch the ratings either from the cache, or from calling TMDB/OMDB APIs.
     *
     */
    async fetchRatings(){
        // If the cache was not created yet, or the title is not in the cache, or the result is potentially inaccurate,
        // Fetch ratings from TMDB/OMDB
        if (this.cachedRatings == null || this.cachedRatings[this.title] == null || this.cachedRatings[this.title]["accurate_result"] === false){
            console.log("No cache for", this.title, ". Fetching from API...")
            await this.fetchRatingsFromAPI()
            this.addRatingsToDetailsContainer()
            return
        }
        let dateUpdated = new Date(this.cachedRatings[this.title]["date_updated"])
        let now = new Date()
        const diffDays = (now - dateUpdated)/ (1000 * 60 * 60 * 24)
        // If the cache is older than NB_DAYS_FOR_REFRESH, fetch ratings from TMDB/OMDB
        if (diffDays > NB_DAYS_FOR_REFRESH){
            console.log(`Cache is ${diffDays} old, and the limit is ${NB_DAYS_FOR_REFRESH}. Fetching from API...`)
            await this.fetchRatingsFromAPI()
            this.addRatingsToDetailsContainer()
            return
        }
        // Just display ratings from the cache.
        this.mediaRatings = this.cachedRatings[this.title]
        this.addRatingsToDetailsContainer()
    }

    /**
     * Fetch the ratings from TMDB/OMDB for this title, and add them to the cache.
     */
    async fetchRatingsFromAPI(){
        this.mediaRatings = {}
        await this.fetchTmdbData()
        await this.fetchOmdbData()
        Object.assign(this.mediaRatings, this.tmdbData.mediaRatings, this.omdbData.mediaRatings)
        if (this.mediaRatings !== {}){
            if (this.cachedRatings == null) this.cachedRatings = {}
            this.cachedRatings[this.title] = this.mediaRatings
            let toCache = {}
            toCache["netflixMediaRatings"] = this.cachedRatings
            chrome.storage.sync.set(toCache, () => refreshContainersMainPage(this.cachedRatings))
        }
    }

    /**
     * Fetch data from TMDB.
     * First try to get person data from the person of interest (if any), and then try to get the
     * media data.
     */
    async fetchTmdbData(){
        await this.tmdbData.fetchPerson()
        await this.tmdbData.fetchMediaData()
    }

    /**
     * Fetch data from OMDB. Since OMDB only allows you to search for a title or a IMDB ID, and the former
     * can be inaccurate, only search if a IMDB ID was found when fetching data from TMDB.
     */
    async fetchOmdbData(){
        if (this.tmdbData.imdbId === undefined || this.tmdbData.imdbId === null) return
        this.omdbData.imdbId = this.tmdbData.imdbId
        await this.omdbData.fetchMediaData()
    }

    /**
     * Add ratings information at the top of the Details container. It will include only ratings data of the sites
     * from which data was found (e.g. IMDB, TMDB, Metacritic) with some links to the respective sites, and will be shown
     * in orange if the results are potentially inaccurate.
     */
    addRatingsToDetailsContainer(){
        let detailsMetadata = this.detailsContainer.getElementsByClassName("previewModal--detailsMetadata-left")[0]
        let ratingStr = getRatingsStr(this.title, this.mediaRatings)
        if (ratingStr === "") return
        let ratingElement = document.createElement("p")
        ratingElement.className = "detailsPageRating"
        ratingElement.innerHTML = ratingStr
        detailsMetadata.insertBefore(ratingElement, detailsMetadata.children[1])

    }
}

/**
 * Get data from OMDB (https://www.omdbapi.com/). Requires an API key, and having a IMDB ID of the title.
 * Gets ratings from IMDB and Metacritic, if any.
 */
class OmdbData{
    /**
     * Construct a OmdbData object.
     *
     * @param {string|undefined} [imdbId=undefined] The IMDB ID as a string.
     */
    constructor(imdbId=undefined){
        this.imdbId = imdbId
        this.mediaData = undefined
        this.mediaRatings = {}
        this.apiHost = "https://www.omdbapi.com"
        this.apiKey = OMDB_API_KEY
    }

    /**
     * Fetch data from OMDB using an IMDB ID,
     * and add IMDB/Metacritic rating to this.mediaRatings, if any.
     */
    async fetchMediaData(){
        let url = `${this.apiHost}/?i=${this.imdbId}&apikey=${this.apiKey}`
        this.mediaData = await fetchJSON(url)
        console.log("Got OMDB data", this.mediaData)
        if (this.mediaData["imdbRating"] !== "N/A") {
            this.mediaRatings["IMDB"] = {
                "rating": this.mediaData["imdbRating"],
                "count": this.mediaData["imdbVotes"],
                "id": this.imdbId,
            }
        }
        if (this.mediaData["Metascore"] !== "N/A") {
            this.mediaRatings["Meta"] = {
                "rating": this.mediaData["Metascore"],
            }
        }
    }
}

/**
 * Get media data from TMDB (https://developers.themoviedb.org/, https://developers.themoviedb.org/3/getting-started/introduction).
 *
 * First try to: get credits data from a person of interest, find the title in the credits. That match is considered
 * accurate (note: could be inaccurate if many titles from the same year are credited to the same person..)
 *
 * If not found this way, or no person of interest was provided (can happen for documentaries), try to get the data by searching
 * for the title. But the result is potentially inaccurate, so flag it as such.
 */
class TMDBData{
    constructor(title, year, person, personType) {
        this.title = title
        this.year = year
        this.person = person
        this.personType = personType
        this.apiHost = "https://api.themoviedb.org/3"
        this.apiKey = TMDB_API_KEY
        this.peopleData = []
        this.mediaData = undefined
        this.mediaRatings = {}
        this.imdbId = undefined
    }

    /**
     * If a person of interest was provided, find him/her/them (people can have identical names).
     * Store the people found, if any, in this.peopleData.
     */
    async fetchPerson(){
        if (this.person === undefined){
            return
        }
        let url = `${this.apiHost}/search/person?api_key=${this.apiKey}&query=${encodeURIComponent(this.person)}`
        var peopleData = await fetchJSON(url)
        if (peopleData["results"].length === 0) return
        this.peopleData = peopleData["results"]
    }

    /**
     * Fetch data for the media provided.
     *
     * First search from the credits of the people found from the name of the person of interest provided.
     * If there are no matches, or no person of interest was provided, search by title (potentially inaccurate).
     * If a title was found, store:
     * - the media info in this.mediaData
     * - the TMDB rating of the title in this.mediaRatings
     * - the IMDB ID, if any, in this.imdbID (useful to query OMDB)
     */
    async fetchMediaData() {
        // If searching only by title because no people data (e.g. documentary with no director/cast info)
        // we cannot be sure we have the right result since we're just getting the first one.
        let accurateResult = true

        for (let personData of this.peopleData) {
            if (this.mediaData !== undefined) break
            let creditsURL = `${this.apiHost}/person/${personData["id"]}/combined_credits?api_key=${this.apiKey}`
            var creditsData = await fetchJSON(creditsURL)
            if (creditsData[this.personType].length === 0) continue

            for (let credit of creditsData[this.personType]) {
                if (
                    (credit["title"] === this.title || credit["name"] === this.title)
                    && (credit["release_date"] === undefined || credit["release_date"].includes(this.year))
                ) {
                    if (this.personType === "crew" && !(credit["job"] === "Creator" || credit["job"] === "Director")) continue
                    console.log("Found match for person", this.person, this.personType, ":", credit)
                    this.mediaData = credit
                    break
                }
            }
        }
        if (this.mediaData === undefined){
            console.warn(`Could not find person ${this.person} or person credits for ${this.title}. Will search for movie data directly...`)
            let multiSearchUrl = `${this.apiHost}/search/multi?api_key=${this.apiKey}&query=${encodeURIComponent(this.title)}`
            var results = await fetchJSON(multiSearchUrl)
            if (results["results"].length === 0){
                console.warn(`Could not find title ${this.title}. Nothing more to do...`)
                return
            }
            this.mediaData = results["results"][0]
            accurateResult = false
        }
        if (this.mediaData === undefined) {
            console.warn(`${this.title} not found at all.`)
            return
        }
        this.mediaRatings["media_type"] = this.mediaData["media_type"]
        this.mediaRatings["accurate_result"] = accurateResult
        this.mediaRatings["date_updated"] = new Date().toUTCString()
        if (this.mediaData["vote_average"] !== 0 && this.mediaData["vote_count"] !== 0){
            this.mediaRatings["TMDB"] = {
                "rating": this.mediaData["vote_average"],
                "count": this.mediaData["vote_count"],
                "id": this.mediaData["id"],
            }
        }

        let mediaExternalIdsUrl = `${this.apiHost}/${this.mediaData["media_type"]}/${this.mediaData["id"]}/external_ids?api_key=${this.apiKey}`
        var mediaExternalIds = await fetchJSON(mediaExternalIdsUrl)
        this.imdbId = mediaExternalIds["imdb_id"]
    }
}

/**
 * Method called when the DOM has loaded.
 * Try to get cached ratings.
 *
 * @callback domReadyCallback
 */
docReady(function() {
    // chrome.storage.sync.remove(["netflixMediaRatings"])
    chrome.storage.sync.get(["netflixMediaRatings", "netflixMediaRatingsTmdbApiKey", "netflixMediaRatingsOmdbApiKey"], result => cacheReady(result))

});

/**
 * Method called when the cached ratings were loaded.
 *
 * @param {Object} result the cache, containing potentially a "netflixMediaRatings" key holding
 *                        all the ratings from all titles.
 */
async function cacheReady(result) {
    body = document.querySelector("body")
    let cachedRatings = result.netflixMediaRatings
    TMDB_API_KEY = result.netflixMediaRatingsTmdbApiKey
    OMDB_API_KEY = result.netflixMediaRatingsOmdbApiKey
    let apiKeysValid = true
    if (TMDB_API_KEY === undefined || OMDB_API_KEY === undefined) {
        apiKeysValid = false
    }
    else {
        apiKeysValid = await testAPIs()
    }
    chrome.runtime.sendMessage({
        action: 'setDisabledIcon',
        value: !apiKeysValid
    });
    if (!apiKeysValid) {
        return
    }

    refreshContainersMainPage(cachedRatings)
    observeDOM( body, m => observeDOMCallback(cachedRatings, m));
    // let aboutWrappers = document.getElementsByClassName("about-wrapper")
    // if (aboutWrappers.length > 0) {
    //     let netflixDetailsView = new NetflixDetailsView(cachedRatings, aboutWrappers[0])
    //     netflixDetailsView.fetchRatings()
    // }
}

/**
 * Method to test if the API keys provided are correct.
 * Returns true if they are, false if they are not.
 * @returns {boolean}
 */
async function testAPIs(){
    let errors = []
    let omdbUrl = `https://www.omdbapi.com/?t=foo&apikey=${OMDB_API_KEY}`
    let tmdbUrl = `https://api.themoviedb.org/3/configuration?api_key=${TMDB_API_KEY}`
    try{
        await fetchJSON(omdbUrl)
        await fetchJSON(tmdbUrl)
    } catch (e){
        return false
    }
    return true
}


/**
 * Add ratings to all thumnbails which have cached ratings.
 *
 * @param {Object} cachedRatings A cache of all ratings for all media titles already fetched.
 * @param {HTMLElement[] | undefined} [titleContainers=undefined] A list of title containers to add the information to.
 *                                                                If none is provided, add cached information to all titles.
 */
function refreshContainersMainPage(cachedRatings, titleContainers=undefined){
    if (titleContainers == undefined) {
        titleContainers = document.getElementsByClassName("title-card-container")
    }
    Array.from(titleContainers).forEach((titleContainer) => {
        let netflixThumbnailView = new NetflixThumbnailView(cachedRatings, titleContainer)
        netflixThumbnailView.fetchRatings()
    })

}

/**
 * Function called when something in the DOM is added/removed.
 * @param {Object} cachedRatings A cache of all ratings for all media titles already fetched.
 * @param {HTMLElement} htmlElement The htmlElement being observed, in our case, the whole body.
 */
function observeDOMCallback(cachedRatings, htmlElement){
    htmlElement.forEach(record => {
        if (record.addedNodes.length > 0) {
            record.addedNodes.forEach(node => addedNodeCallback(cachedRatings, node))
        }
    })
}

/**
 * Callback called for each node added to the DOM. Check if a details view is added, or if some
 * thumbnail views were added (e.g. scrolling down) and add ratings accordingly.
 *
 * @param {Object} cachedRatings A cache of all ratings for all media titles already fetched.
 * @param {HTMLElement} addedNode A node that was added to the DOM
 */
async function addedNodeCallback(cachedRatings, addedNode){

    // Happens when the user opens up a media title's detailed view.
    let aboutWrappers = addedNode.getElementsByClassName("about-wrapper")
    if (aboutWrappers.length > 0) {
        let netflixDetailsView = new NetflixDetailsView(cachedRatings, aboutWrappers[0])
        await netflixDetailsView.fetchRatings()
    }
    // Happens when Netflix asynchronously adds more thumbnail views, either when the page
    // is first loaded, or when the user scrolls down.
    let titleContainers = addedNode.getElementsByClassName("title-card-container")
    if (titleContainers.length > 0) {
        refreshContainersMainPage(cachedRatings, titleContainers)
    }
}