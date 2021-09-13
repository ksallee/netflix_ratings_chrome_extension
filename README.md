# Netflix ratings Google Chrome extension
A Chrome extension to get Netflix media ratings (IMDB, Metacritic, TMDB)

It requires getting a [TMDB API key](https://developers.themoviedb.org/3/getting-started/introduction) and an [OMDB API key](http://www.omdbapi.com/apikey.aspx)

## Setup the Chrome extension locally

1. Clone the repository.
2. Navigate to your [Extensions tab](chrome://extensions/).
3. On the top right corner, enable developer mode.
4. Click on the `Load Unpacked` button on the top left.
5. Select the repository root folder

## Configure the extension

1. Click on the extension button (you can pin it if you wish).
2. Enter your TMDB/OMDB API keys

## Use the extension

Given that on a Netflix page, the HTML only gives access to the media titles, and it's pretty inaccurate to use only that data to search for information about some media, the only way to get ratings information is if you check the details of a movie/TV show.

When you open a movie/TV show details, the ratings it could find will appear on the top of the details page. If the result could be inaccurate, they will be displayed in orange. This can happen if the extension could not find the media information using Director/Creator/Cast information from the details page.

The ratings of a film are saved in a cache, and are now accessible on the main page, under each movie/TV show.

If you reopen the details of a movie/TV show after 1 day, the cached information is considered stale and new results will be fetched. This is to guarantee that the ratings are up to date.
