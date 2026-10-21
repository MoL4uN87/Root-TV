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
    detail = detail || {};
    // Android MovieResponse exposes independent stream catalogs. A single ||
    // fallback hides HDVB, streamCatalog and streamLists when Veoveo exists.
    var catalogs = [
      { data: detail.stream_lists_veoveo || detail.streamListsVeoveo, provider: 'Veoveo' },
      { data: detail.stream_lists_hdvb || detail.streamListsHdvb, provider: 'HDVB' },
      { data: detail.stream_lists || detail.streamLists, provider: 'Seena' },
      { data: detail.stream_catalog || detail.streamCatalog, provider: 'Каталог' }
    ];
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

    var visited = [];
    catalogs.forEach(function (entry) {
      var catalog = entry.data;
      if (!catalog || typeof catalog !== 'object' || visited.indexOf(catalog) >= 0) return;
      visited.push(catalog);
      function useVoice(voice, prefix, seasonNumber) {
        // Keep explicit provider from API, otherwise use the catalog origin.
        if (voice && typeof voice === 'object' && !providerOf(voice)) {
          voice = Object.assign({}, voice, { provider: entry.provider });
        }
        addVoice(voice, prefix, seasonNumber);
      }
      if (Array.isArray(catalog)) {
        catalog.forEach(function (voice) { useVoice(voice, '', null); }); return;
      }
      // Android lists may be present under multiple aliases at once.
      ['movieVoices', 'movie_voices', 'apiVoices', 'api_voices', 'voices'].forEach(function (key) {
        if (Array.isArray(catalog[key])) catalog[key].forEach(function (voice) { useVoice(voice, '', null); });
      });
      if (!Array.isArray(catalog.seasons)) return;
      catalog.seasons.forEach(function (season) {
        if (!Array.isArray(season.episodes)) return;
        season.episodes.forEach(function (episode) {
          var seasonNumber = first(season, ['seasonNumber', 'season_number'], first(episode, ['seasonNumber', 'season_number'], null));
          var episodeNumber = first(episode, ['episodeNumber', 'episode_number', 'number'], '?');
          var label = 'Сезон ' + (seasonNumber == null ? '?' : seasonNumber) + ' · Серия ' + episodeNumber;
          ['voices', 'apiVoices', 'api_voices'].forEach(function (key) {
            if (Array.isArray(episode[key])) episode[key].forEach(function (voice) { useVoice(voice, label, seasonNumber); });
          });
        });
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

  // API torrent listings may label a tracker in several ways. Keep the source
  // label from the API; infer known names from an actual tracker URL only.
  function torrentPlatform(item) {
    var keys = ['tracker_name', 'trackerName', 'tracker', 'torrent_tracker',
      'torrentTracker', 'tracker_title', 'trackerTitle', 'source_name',
      'sourceName', 'torrent_source', 'torrentSource', 'site_name', 'siteName',
      'site', 'source', 'provider_name', 'providerName', 'provider',
      'indexer_name', 'indexerName', 'indexer', 'origin'];
    function asLabel(value) {
      if (!value) return '';
      if (Array.isArray(value)) return asLabel(value[0]);
      if (typeof value === 'object') return asLabel(first(value,
        ['name', 'title', 'label', 'site', 'domain', 'url', 'host'], ''));
      if (typeof value !== 'string') return '';
      var label = value.trim();
      if (!label) return '';
      // Normalize the three common Seena tracker names for the TV labels.
      if (/bit[.-]?ru/i.test(label)) return 'BitRu';
      if (/korsars?/i.test(label)) return 'Korsars';
      if (/lost[.-]?film/i.test(label)) return 'LostFilm';
      if (/^https?:\/\//i.test(label)) {
        try { label = new URL(label).hostname.replace(/^www\./i, ''); }
        catch (_) { return ''; }
      }
      if (/^(?:unknown|null|none|torrent|tracker|magnet|n\/a)$/i.test(label)) return '';
      return label.slice(0, 65);
    }
    for (var i = 0; i < keys.length; i += 1) {
      var name = asLabel(item && item[keys[i]]);
      if (name) return name;
    }
    var trackerUrl = first(item, ['tracker_url', 'trackerUrl', 'site_url', 'siteUrl'], '');
    return asLabel(trackerUrl);
  }

  function torrentCount(value) {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value === 'string') value = value.replace(/[\s,]/g, '').trim();
    var count = Number(value);
    return isFinite(count) && count >= 0 ? Math.floor(count) : null;
  }

  function torrentSizeLabel(value) {
    if (value === null || value === undefined || value === '') return '';
    if (typeof value === 'string' && /[^\d\s]/.test(value) && !/^\d+(?:[\s,]\d{3})*$/.test(value.trim()))
      return value.trim(); // API has already supplied a human-readable unit.
    var bytes = Number(String(value).replace(/[\s,]/g, ''));
    if (!isFinite(bytes) || bytes < 0) return '';
    var units = ['Б', 'КБ', 'МБ', 'ГБ', 'ТБ'];
    var unit = 0;
    while (bytes >= 1024 && unit < units.length - 1) { bytes /= 1024; unit += 1; }
    return (unit === 0 ? String(Math.floor(bytes)) :
      bytes >= 100 ? bytes.toFixed(0) : bytes >= 10 ? bytes.toFixed(1) : bytes.toFixed(2)) +
      ' ' + units[unit];
  }

  function torrentItems(response) {
    var rows = [];
    if (Array.isArray(response)) rows = response;
    else if (response && Array.isArray(response.data)) rows = response.data;
    else if (response && Array.isArray(response.torrents)) rows = response.torrents;
    else if (response && response.data && Array.isArray(response.data.torrents)) rows = response.data.torrents;
    else if (response && Array.isArray(response.results)) rows = response.results;
    return rows.filter(function (item) { return item && typeof item === 'object'; })
      .map(function (item, index) {
      var quality = first(item, ['quality', 'quality_label', 'qualityLabel'], '');
      return {
        id: String(first(item, ['id', 'torrent_idx', 'torrentIdx'], index)),
        name: first(item, ['name', 'title', 'filename'], 'Торрент'),
        quality: quality ? String(quality) : '',
        voice: first(item, ['voice', 'voice_label', 'voiceLabel'], stringList(first(item, ['voices'], [])).join(', ')),
        platform: torrentPlatform(item),
        size: torrentSizeLabel(first(item, ['size_display', 'sizeDisplay',
          'size', 'torrent_size', 'torrentSize', 'total_size', 'totalSize', 'file_size', 'fileSize'], '')),
        seeders: torrentCount(first(item, ['seeders', 'seeds', 'seed_count',
          'seedCount', 'seeders_count', 'seedersCount', 'seed', 'seeder_count', 'seederCount'], null)),
        peers: torrentCount(first(item, ['peers', 'leechers', 'leechers_count',
          'leechersCount', 'peer_count', 'peerCount'], null)),
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

  function kinozalSearchTitle(value) {
    return String(value || '').split(/\s+\/\s+/)[0]
      .replace(/\s*\((?:19|20)\d{2}[^)]*\)\s*$/i, '').trim();
  }

  function kinozalSearchQueries(value) {
    var parts = String(value || '').split(/\s+\/\s+/), out = [];
    parts.slice(0, 2).forEach(function (part) {
      var title = part
        .replace(/\s*\((?=[^)]*(?:сезон|сери))[^)]*\)\s*$/i, '')
        .replace(/\s*\((?:сериал\s*)?(?:19|20)\d{2}[^)]*\)\s*$/i, '')
        .replace(/\s*\[(?:19|20)\d{2}[^\]]*\]\s*$/i, '')
        .trim();
      if (title && !/^(?:19|20)\d{2}$/.test(title) && out.indexOf(title) < 0) out.push(title);
    });
    return out.length ? out : (kinozalSearchTitle(value) ? [kinozalSearchTitle(value)] : []);
  }

  function kinozalActorNames(value) {
    var out = [];
    String(value || '').replace(/\([^)]*\)/g, '').split(/\s*,\s*|\s+и\s+/i).forEach(function (part) {
      var name = part.replace(/\s+/g, ' ').trim();
      if (name && name.split(' ').length >= 2 && out.indexOf(name) < 0) out.push(name);
    });
    return out;
  }

  function normalizedTitle(value) {
    return String(value || '').toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9]+/g, '');
  }

  function bestCatalogMatch(response, title, year, mediaType) {
    var wanted = normalizedTitle(title), wantedYear = String(year || '').match(/(?:19|20)\d{2}/);
    var ranked = catalogItems(response).map(function (item) {
      var raw = item.raw || {}, names = [item.title, raw.original_title, raw.original_name].map(normalizedTitle).filter(Boolean);
      var score = names.reduce(function (best, name) {
        if (name === wanted) return Math.max(best, 100);
        if (wanted && (name.indexOf(wanted) !== -1 || wanted.indexOf(name) !== -1)) return Math.max(best, 50);
        return best;
      }, 0);
      if (wantedYear && item.year === wantedYear[0]) score += 25;
      if (mediaType && item.mediaType === mediaType) score += 10;
      return { item: item, score: score };
    }).sort(function (a, b) { return b.score - a.score; });
    return ranked.length && ranked[0].score >= 50 ? ranked[0].item : null;
  }

  function bestCatalogMatchAny(response, titles, year, mediaType) {
    var best = null;
    (titles || []).some(function (title) {
      best = bestCatalogMatch(response, title, year, mediaType);
      return Boolean(best);
    });
    return best;
  }

  function normalizedPersonName(value) {
    return String(value || '').toLowerCase().replace(/ё/g, 'е')
      .replace(/[aceopxykmtbh]/g, function (letter) {
        return ({ a:'а', c:'с', e:'е', o:'о', p:'р', x:'х', y:'у', k:'к', m:'м', t:'т', b:'в', h:'н' })[letter];
      }).replace(/[^а-я0-9]+/g, '');
  }

  function bestDetailByCast(details, actorNames) {
    var wanted = (actorNames || []).map(normalizedPersonName).filter(Boolean), best = null, bestScore = 0;
    (details || []).forEach(function (detail) {
      var actual = castItems(detail).map(function (person) { return normalizedPersonName(person.name); });
      var score = wanted.reduce(function (sum, name) { return sum + (actual.indexOf(name) >= 0 ? 1 : 0); }, 0);
      if (score > bestScore) { bestScore = score; best = detail; }
    });
    return best;
  }

  function horizontalNavigationIndex(current, direction, length) {
    if (!length) return -1;
    var next = Number(current) + (direction === 'left' ? -1 : direction === 'right' ? 1 : 0);
    return Math.max(0, Math.min(length - 1, next));
  }


  // A film may expose its trailer in the catalog row, the detail response or TMDB-style videos.
  // Only known video formats/YouTube hosts are accepted; do not embed arbitrary page URLs.
  function trailerMedia(value) {
    if (value && typeof value === 'object') {
      // Android Seena accepts a nonempty Trailer.key if Trailer.site is empty,
      // or its normalized name contains "youtube"/"youtu".
      var site = String(value.site || '').trim().toLowerCase();
      var key = String(value.key || '').trim();
      if ((!site || site.indexOf('youtu') !== -1) && /^[A-Za-z0-9_-]{11}$/.test(key))
        return { mode: 'youtube', videoId: key };
      return trailerMedia(value.url || value.link || value.src || '');
    }
    if (typeof value !== 'string') return null;
    try {
      var url = new URL(value);
      if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
      var host = url.hostname.toLowerCase(), id = '';
      if (host === 'youtu.be') id = url.pathname.slice(1);
      else if (host === 'youtube.com' || host === 'www.youtube.com' || host === 'm.youtube.com' || host === 'www.youtube-nocookie.com') {
        if (url.pathname === '/watch') id = url.searchParams.get('v') || '';
        else if (/^\/(?:embed|shorts)\//.test(url.pathname)) id = url.pathname.split('/')[2] || '';
      }
      if (id && /^[A-Za-z0-9_-]{11}$/.test(id))
        return { mode: 'youtube', videoId: id };
      if (/\.(?:mp4|m3u8)$/i.test(url.pathname))
        return { mode: 'direct', url: url.href };
    } catch (_) {}
    return null;
  }

  function trailerSource(detail, item) {
    var objects = [detail || {}, item && item.raw || {}, item || {}], fields = [
      'trailer_url', 'trailerUrl', 'trailer', 'trailer_link', 'trailerLink',
      'youtube_trailer_url', 'youtubeTrailerUrl'
    ];
    for (var i = 0; i < objects.length; i += 1) {
      var obj = objects[i];
      for (var f = 0; f < fields.length; f += 1) {
        var source = trailerMedia(obj[fields[f]]);
        if (source) return source;
      }
      var youtubeId = obj.youtube_id || obj.youtubeId;
      if (youtubeId) {
        var byId = trailerMedia({ site: 'YouTube', key: youtubeId });
        if (byId) return byId;
      }
      var videos = obj.videos && (obj.videos.results || obj.videos.data || obj.videos);
      if (!Array.isArray(videos)) continue;
      var trailers = videos.filter(function (v) {
        return v && /^(trailer|teaser|трейлер|тизер)$/i.test(String(v.type || v.video_type || ''));
      }).sort(function (a, b) {
        return (b.official === true ? 1 : 0) - (a.official === true ? 1 : 0);
      });
      for (var j = 0; j < trailers.length; j += 1) {
        var video = trailerMedia(trailers[j]);
        if (video) return video;
      }
    }
    return null;
  }

  function trailerSearchQuery(item) {
    var name = String(item && item.title || '').split(/\s+\/\s+/)[0].trim();
    var year = String(item && item.year || '').match(/(?:19|20)\d{2}/);
    return [name, year ? year[0] : '', 'трейлер'].filter(Boolean).join(' ').slice(0, 120);
  }

  function trailerNormalize(value) {
    return ' ' + String(value || '').toLowerCase().replace(/ё/g, 'е')
      .replace(/[^a-z0-9а-я]+/g, ' ').replace(/\s+/g, ' ').trim() + ' ';
  }

  function trailerSearchResults(results, item) {
    var raw = item && item.raw || {}, name = String(item && item.title || '').split(/\s+\/\s+/)[0];
    var names = [name, raw.original_title, raw.original_name].map(trailerNormalize)
      .filter(function (v) { return v.trim().length >= 3; });
    var yearMatch = String(item && item.year || '').match(/(?:19|20)\d{2}/);
    return (Array.isArray(results) ? results : []).map(function (video) {
      if (!video || !video.preview || !video.title) return null;
      var title = trailerNormalize(video.title);
      if (!/\b(trailer|teaser)\b/.test(title) && !/трейлер|тизер/.test(title)) return null;
      if (/обзор|реакци|рецензи|разбор|пароди|фанатск|fan made|fanmade|reaction|review|breakdown/.test(title)) return null;
      var nameLength = 0;
      names.forEach(function (n) { if (title.indexOf(n) !== -1) nameLength = Math.max(nameLength, n.length - 2); });
      if (!nameLength) return null;
      var resultYear = String(video.title).match(/\b(?:19|20)\d{2}\b/);
      if (nameLength < 5 && (!yearMatch || !resultYear || yearMatch[0] !== resultYear[0])) return null;
      if (yearMatch && resultYear && Math.abs(Number(yearMatch[0]) - Number(resultYear[0])) > 1) return null;
      var score = nameLength + (yearMatch && resultYear && yearMatch[0] === resultYear[0] ? 12 : 0)
        + (/официальн|official/.test(title) ? 6 : 0)
        + (/трейлер|trailer/.test(title) ? 5 : 0);
      return { video: video, score: score };
    }).filter(Boolean).sort(function (a, b) { return b.score - a.score; })
      .slice(0, 8).map(function (match) { return match.video; });
  }

  function matchBroadcastItems(response) {
    var rows = response && response.result && Array.isArray(response.result.broadcasts) ? response.result.broadcasts : [];
    return rows.filter(function (row) { return row && !row.isPaid && row.mediaId; }).map(function (row) {
      return { id: String(row.mediaId), title: row.title || row.subtitle || 'Трансляция', subtitle: row.subtitle || '',
        channel: row.channel || '', startAt: row.startAt || '', finishAt: row.finishAt || '', live: Boolean(row.isLive),
        image: imageUrl(row.imageUrl || '', 'w780') };
    }).sort(function (a, b) { if (a.live !== b.live) return a.live ? -1 : 1; return String(a.startAt).localeCompare(String(b.startAt)); });
  }

  function approvedUrl(value, hostname, pathPattern) {
    try { var parsed = new URL(String(value || '')); return parsed.protocol === 'https:' && parsed.hostname === hostname && pathPattern.test(parsed.pathname) ? parsed.href : ''; }
    catch (_) { return ''; }
  }

  function matchPlayerUrl(response) {
    return approvedUrl(response && response.result && response.result.playerUrl, 'video.matchtv.ru', /^\/iframe\//);
  }

  function matchStreamUrl(response) {
    return response && response.status === 'ready' ? approvedUrl(response.url, 'm3u8.video.matchtv.ru', /^\/media\/(?:start|playlist)\/.*\.m3u8$/) : '';
  }

  function inAppTvUrl(value) { return approvedUrl(value, 'ntvplus.tv', /^\/(?:channel\/|free\/?$)/); }
  function iptvStreamUrl(response) { try { var parsed = new URL(String(response && response.url || '')); return parsed.protocol === 'https:' && !parsed.port && !parsed.username && !parsed.password && /\.m3u8$/i.test(parsed.pathname) ? parsed.href : ''; } catch (_) { return ''; } }

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
    torrentPlatform: torrentPlatform,
    torrentSizeLabel: torrentSizeLabel,
    searchUrl: searchUrl,
    catalogUrl: catalogUrl,
    catalogMetadataUrl: catalogMetadataUrl,
    filteredCatalogUrl: filteredCatalogUrl,
    detailUrl: detailUrl,
    torrentsUrl: torrentsUrl,
    bestTorrentUrl: bestTorrentUrl,
    personUrl: personUrl,
    personCreditsUrl: personCreditsUrl,
    kinozalSearchTitle: kinozalSearchTitle,
    kinozalSearchQueries: kinozalSearchQueries,
    kinozalActorNames: kinozalActorNames,
    bestCatalogMatch: bestCatalogMatch,
    bestCatalogMatchAny: bestCatalogMatchAny,
    bestDetailByCast: bestDetailByCast,
    horizontalNavigationIndex: horizontalNavigationIndex,
    matchBroadcastItems: matchBroadcastItems,
    matchPlayerUrl: matchPlayerUrl,
    matchStreamUrl: matchStreamUrl,
    inAppTvUrl: inAppTvUrl,
    iptvStreamUrl: iptvStreamUrl,
    trailerSource: trailerSource,
    trailerSearchQuery: trailerSearchQuery,
    trailerSearchResults: trailerSearchResults
  };
}));
