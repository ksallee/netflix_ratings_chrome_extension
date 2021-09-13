
chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
    if (msg.action === "setDisabledIcon") {
        if (msg.value) {
            chrome.action.setIcon({path: "/images/netflix_ratings_disabled.png"});
        } else {
            chrome.action.setIcon({path: "/images/netflix_ratings.png"});
        }
    }
});