(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SeenaModel = api;
}(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  var BASE = 'https://spider01.com/api/';
  var TMDB_IMAGE = 'https://image.tmdb.org/t/p/';

  function first(obj, names, fallback) {
    var i, value;
    if (!obj) return fallback;
    for (i = 0; i < names.length; i += 1) {
      value = obj[names[i]];
      if (value !== undefined && value !== null && value !== '') return value;
    }
    return fallback;
  }

  function imageUrl(value, size) {
    if (typeof value !== 'string' || !value) return '';
    if (/^https?:\/\//i.test(value)) return value;
    if (value.charAt(0) === '/') return TMDB_IMAGE + (size || 'w500') + value;
    return value;
  }

  function rowToMovie(item) {
    if (!item) return null;
    var id = first(item, ['id', 'movie_id', 'movieId', 'title_id', 'titleId'], null);
    if (id === null) return null;
    return {
      id: String(id),
      mediaType: first(item, ['media_type', 'mediaType', 'type'], 'movie'),
      title: first(item, ['title', 'name'], 'Без названия'),
      overview: first(item, ['overview', 'description'], ''),
      poster: imageUrl(first(item, ['poster_url', 'posterUrl', 'poster', 'image'], ''), 'w500'),
      backdrop: imageUrl(first(item, ['backdrop_url', 'backdropUrl', 'backdrop'], ''), 'w1280'),
      year: String(first(item, ['release_date', 'releaseDate', 'first_air_date', 'firstAirDate', 'release'], '')).slice(0, 4),
      rating: Number(first(item, ['vote_average', 'voteAverage', 'weighted_rating', 'weightedRating', 'imdb_rating', 'imdbRating'], 0)) || 0,
      voteCount: Number(first(item, ['vote_count', 'voteCount', 'votes'], 0)) || 0,
      popularity: Number(first(item, ['popularity', 'popularity_score', 'popularityScore'], 0)) || 0,
      genres: stringList(first(item, ['genres', 'genreLists', 'genre_lists'], [])),
      countries: stringList(first(item, ['countries', 'production_countries', 'productionCountries'], [])),
      raw: item
    };
  }

  function catalogItems(response) {
    var rows = response && Array.isArray(response.data) ? response.data : [];
    return rows.map(rowToMovie).filter(function (item) { return item !== null; });
  }

  function validVideoUrl(raw) {
    if (typeof raw !== 'string' || !/^https?:\/\//i.test(raw)) return false;
    try { return /^https?:$/.test(new URL(raw).protocol); } catch (_) { return false; }
  }

  function qualityDisplayLabel(value) {
    var raw = value == null ? '' : String(value).trim();
    if (!raw) return '';
    var key = raw.toLowerCase().replace(/\s+/g, '');
    var map = {
      '4k': '2160p', '2160p': '2160p',
      '2k': '1440p', 'qhd': '1440p', '1440p': '1440p',
      'fullhd': '1080p', 'fhd': '1080p', '1080p': '1080p',
      'high': '720p', 'hd': '720p', '720p': '720p',
      'medium': '480p', '480p': '480p',
      'low': '360p', '360p': '360p',
      'lowest': '240p', '240p': '240p',
      'tiny': '144p', '144p': '144p',
      'auto': 'авто', 'авто': 'авто'
    };
    return map[key] || raw;
  }

  function inferQualityFromUrl(url) {
    var m = String(url || '').match(/(?:^|[^0-9])(2160|1440|1080|720|480|360|240|144)p?(?:[^0-9]|$)/i);
    return m ? m[1] + 'p' : '';
  }

  function directSources(detail) {
    var catalog = detail && (detail.stream_lists_veoveo || detail.streamListsVeoveo || detail.stream_lists || detail.streamLists) || {};
    var out = [], seen = {};
    var qualityRank = {'2160p': 90, '1440p': 80, '1080p': 70, '720p': 60, '480p': 50, '360p': 40, '240p': 30, '144p': 20, 'авто': 10};

    function rawUrl(obj) { return obj && first(obj, ['filepath', 'url', 'file', 'link', 'src', 'streamUrl', 'stream_url'], ''); }
    function voiceLabel(obj) { return first(obj, ['label', 'voice', 'voiceLabel', 'voice_label', 'name', 'translation', 'translator'], 'Озвучка'); }
    function qualityOf(obj, fallback) { return qualityDisplayLabel(first(obj, ['quality', 'qualityLabel', 'quality_label', 'resolution', 'height'], fallback || '')); }
    function providerOf(obj) { return first(obj, ['provider', 'source', 'sourceLabel', 'source_label'], ''); }

    function push(url, voice, quality, prefix, seasonNumber, provider) {
      if (!validVideoUrl(url)) return;
      quality = qualityDisplayLabel(quality) || inferQualityFromUrl(url) || 'авто';
      var label = (prefix ? prefix + ' · ' : '') + (voice || 'Озвучка');
      var key = [url, label, quality].join('|');
      if (seen[key]) return; seen[key] = true;
      out.push({
        label: label,
        voice: voice || 'Озвучка',
        quality: quality,
        provider: provider || '',
        url: url,
        season: seasonNumber == null ? null : Number(seasonNumber),
        type: /\.m3u8(?:\?|$)/i.test(url) ? 'application/vnd.apple.mpegurl' : /\.mp4(?:\?|$)/i.test(url) ? 'video/mp4' : '',
        qualityRank: qualityRank[quality] || 0
      });
    }

    function addVariant(value, voice, fallbackQuality, prefix, seasonNumber, provider, keyHint) {
      if (typeof value === 'string') { push(value, voice, keyHint || fallbackQuality, prefix, seasonNumber, provider); return; }
      if (!value || typeof value !== 'object') return;
      var u = rawUrl(value);
      if (u) push(u, voiceLabel(value) === 'Озвучка' ? voice : voiceLabel(value), qualityOf(value, keyHint || fallbackQuality), prefix, seasonNumber, providerOf(value) || provider);
    }

    function addVoice(voice, prefix, seasonNumber) {
      if (!voice) return;
      var vlabel = voiceLabel(voice), q = qualityOf(voice, ''), provider = providerOf(voice);
      var direct = rawUrl(voice); if (direct) push(direct, vlabel, q, prefix, seasonNumber, provider);
      ['sources', 'qualityOptions', 'quality_options', 'qualities', 'urls', 'files', 'directUrls', 'direct_urls'].forEach(function (name) {
        var variants = voice[name];
        if (Array.isArray(variants)) variants.forEach(function (v) { addVariant(v, vlabel, q, prefix, seasonNumber, provider, ''); });
        else if (variants && typeof variants === 'object') Object.keys(variants).forEach(function (key) { addVariant(variants[key], vlabel, q, prefix, seasonNumber, provider, key); });
      });
    }

    (catalog.movieVoices || catalog.movie_voices || catalog.apiVoices || catalog.api_voices || []).forEach(function (voice) { addVoice(voice, '', null); });
    (catalog.seasons || []).forEach(function (season) {
      (season.episodes || []).forEach(function (episode) {
        var seasonNumber = first(season, ['seasonNumber', 'season_number'], first(episode, ['seasonNumber', 'season_number'], null));
        var episodeNumber = first(episode, ['episodeNumber', 'episode_number', 'number'], '?');
        var label = 'Сезон ' + (seasonNumber || '?') + ' · Серия ' + episodeNumber;
        (episode.voices || episode.apiVoices || episode.api_voices || []).forEach(function (voice) { addVoice(voice, label, seasonNumber); });
      });
    });
    out.sort(function (a, b) { var c = a.label.localeCompare(b.label, 'ru'); return c || b.qualityRank - a.qualityRank; });
    return out;
  }

  function stringList(value) {
    if (!Array.isArray(value)) return [];
    return value.map(function (entry) {
      if (typeof entry === 'string') return entry;
      return first(entry, ['name', 'title', 'label', 'iso_3166_1', 'code'], '');
    }).filter(Boolean);
  }

  function castItems(detail) {
    var cast = detail && Array.isArray(detail.cast) ? detail.cast : [];
    return cast.map(function (person, index) {
      return {
        id: String(first(person, ['id'], index)),
        name: first(person, ['name', 'title'], 'Актёр'),
        role: first(person, ['character', 'role'], ''),
        photo: imageUrl(first(person, ['profile_url', 'profileUrl', 'profile_path', 'profilePath', 'photo', 'poster_url'], ''), 'w342')
      };
    });
  }

  function personInfo(response, fallback) {
    response = response || {};
    fallback = fallback || {};
    return {
      id: String(first(response, ['id'], fallback.id || '')),
      name: first(response, ['name'], fallback.name || 'Актёр'),
      originalName: first(response, ['original_name', 'originalName'], ''),
      photo: imageUrl(first(response, ['profile_path', 'profilePath', 'profile_url', 'profileUrl'], fallback.photo || ''), 'w500')
    };
  }

  function personCreditItems(response) {
    var rows = response && Array.isArray(response.data) ? response.data : [];
    return rows.map(function (entry) {
      var movie = rowToMovie(entry);
      if (!movie) return null;
      movie.character = first(entry, ['character'], '');
      movie.roles = stringList(first(entry, ['roles'], []));
      return movie;
    }).filter(function (item) { return item !== null; });
  }

  function similarItems(detail) {
    var rows = detail && Array.isArray(detail.similar) ? detail.similar : [];
    return rows.map(rowToMovie).filter(function (item) { return item !== null; });
  }

  function detailFacts(detail, fallbackItem) {
    detail = detail || {};
    fallbackItem = fallbackItem || {};
    var genres = stringList(first(detail, ['genres', 'genreLists', 'genre_lists'], []));
    var countries = stringList(first(detail, ['countries', 'production_countries', 'productionCountries'], []));
    var runtime = Number(first(detail, ['runtime'], 0)) || 0;
    var year = String(first(detail, ['release_date', 'releaseDate', 'first_air_date', 'firstAirDate', 'release'], fallbackItem.year || '')).slice(0, 4);
    return {
      year: year,
      mediaType: first(detail, ['media_type', 'mediaType'], fallbackItem.mediaType || 'movie'),
      voteAverage: Number(first(detail, ['vote_average', 'voteAverage', 'weighted_rating', 'weightedRating'], fallbackItem.rating || 0)) || 0,
      voteCount: Number(first(detail, ['vote_count', 'voteCount'], 0)) || 0,
      imdbRating: Number(first(detail, ['imdb_rating', 'imdbRating'], 0)) || 0,
      imdbVotes: Number(first(detail, ['imdb_votes', 'imdbVotes'], 0)) || 0,
      ageRating: first(detail, ['age_rating', 'ageRating'], ''),
      ageRatingCountry: first(detail, ['age_rating_country', 'ageRatingCountry'], ''),
      runtime: runtime,
      genres: genres,
      countries: countries,
      directors: stringList(first(detail, ['directors'], [])),
      writers: stringList(first(detail, ['writers'], [])),
      status: first(detail, ['status'], '')
    };
  }

  function torrentItems(response) {
    var rows = [];
    if (Array.isArray(response)) rows = response;
    else if (response && Array.isArray(response.data)) rows = response.data;
    else if (response && Array.isArray(response.torrents)) rows = response.torrents;
    else if (response && response.data && Array.isArray(response.data.torrents)) rows = response.data.torrents;
    else if (response && Array.isArray(response.results)) rows = response.results;
    return rows.map(function (item, index) {
      var quality = first(item, ['quality', 'quality_label', 'qualityLabel'], '');
      return {
        id: String(first(item, ['id', 'torrent_idx', 'torrentIdx'], index)),
        name: first(item, ['name', 'title', 'filename'], 'Торрент'),
        quality: quality ? String(quality) : '',
        voice: first(item, ['voice', 'voice_label', 'voiceLabel'], stringList(first(item, ['voices'], [])).join(', ')),
        size: first(item, ['size', 'torrent_size', 'torrentSize', 'size_display', 'sizeDisplay'], ''),
        seeders: Number(first(item, ['seeders', 'seeds'], 0)) || 0,
        peers: Number(first(item, ['peers', 'leechers'], 0)) || 0,
        link: first(item, ['magnet', 'link', 'torrent', 'url'], ''),
        hash: first(item, ['hash', 'info_hash', 'infoHash', 'torrent_ih'], ''),
        raw: item
      };
    });
  }

  function searchUrl(query) { return BASE + 'search?query=' + encodeURIComponent(query.trim()); }
  function catalogUrl(name, offset) { return BASE + 'catalog/' + encodeURIComponent(name) + '?offset=' + (offset || 0); }
  function catalogMetadataUrl() { return BASE + 'catalog/metadata'; }
  function filteredCatalogUrl(name, offset, filters, sort) {
    var parts = ['offset=' + (Number(offset) || 0)], f = filters || {};
    if (f.genre) parts.push('genres=' + encodeURIComponent(f.genre));
    if (f.country) parts.push('countries=' + encodeURIComponent(f.country));
    if (f.years) {
      if (f.years === 'older') { parts.push('year_to=1999'); }
      else if (String(f.years).indexOf('-') > 0) { var yr = String(f.years).split('-'); parts.push('year_from=' + encodeURIComponent(yr[0])); parts.push('year_to=' + encodeURIComponent(yr[1])); }
      else { parts.push('year_from=' + encodeURIComponent(f.years)); parts.push('year_to=' + encodeURIComponent(f.years)); }
    }
    if (Number(f.rating) > 0) parts.push('rating_min=' + encodeURIComponent(f.rating));
    if (sort === 'rating') parts.push('sort=rating'); else if (sort === 'new') parts.push('sort=year');
    return BASE + 'catalog/' + encodeURIComponent(name || 'all_movies') + '?' + parts.join('&');
  }
  function detailUrl(id) { return BASE + 'movie/' + encodeURIComponent(id); }
  function torrentsUrl(id) { return BASE + 'movie/' + encodeURIComponent(id) + '/torrents'; }
  function bestTorrentUrl(id) { return BASE + 'movie/' + encodeURIComponent(id) + '/torrent/best'; }
  function personUrl(id) { return BASE + 'person/' + encodeURIComponent(id); }
  function personCreditsUrl(id, limit, offset) {
    return BASE + 'person/' + encodeURIComponent(id) + '/credits?limit=' + (limit || 60) + '&offset=' + (offset || 0);
  }

  return {
    BASE: BASE,
    imageUrl: imageUrl,
    catalogItems: catalogItems,
    directSources: directSources,
    qualityDisplayLabel: qualityDisplayLabel,
    castItems: castItems,
    personInfo: personInfo,
    personCreditItems: personCreditItems,
    similarItems: similarItems,
    detailFacts: detailFacts,
    torrentItems: torrentItems,
    searchUrl: searchUrl,
    catalogUrl: catalogUrl,
    catalogMetadataUrl: catalogMetadataUrl,
    filteredCatalogUrl: filteredCatalogUrl,
    detailUrl: detailUrl,
    torrentsUrl: torrentsUrl,
    bestTorrentUrl: bestTorrentUrl,
    personUrl: personUrl,
    personCreditsUrl: personCreditsUrl
  };
}));
