// CineTrack IMDb Dashboard - Application Logic

// Global State
let movieData = [];
let filteredData = [];
let currentSort = { column: 'Title', ascending: true };
let currentPage = 1;
const rowsPerPage = 10;

// ApexCharts Instances
let charts = {
  ratings: null,
  genres: null,
  decades: null,
  timeline: null
};

// Column Mappings for IMDb CSV normalization
const columnMappings = {
  const: ['const', 'imdb id', 'id', 'imdbid', 'position'],
  yourRating: ['your rating', 'rating', 'user rating', 'user_rating', 'my rating'],
  dateRated: ['date rated', 'date_rated', 'created', 'created date', 'date', 'modified'],
  title: ['title', 'name', 'movie title', 'show title'],
  url: ['url', 'imdb url', 'link'],
  titleType: ['title type', 'type', 'title_type'],
  imdbRating: ['imdb rating', 'imdb_rating', 'average rating', 'avg rating'],
  runtime: ['runtime (mins)', 'runtime', 'runtime_mins', 'duration', 'runtime (minutes)'],
  year: ['year', 'release year', 'year_of_release'],
  genres: ['genres', 'genre', 'categories', 'category'],
  numVotes: ['num votes', 'num_votes', 'votes', 'number of votes'],
  releaseDate: ['release date', 'release_date', 'released'],
  directors: ['directors', 'director', 'directed by']
};

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
});

// Setup Event Listeners
function setupEventListeners() {
  const dropZone = document.getElementById('drop-zone');
  const fileInput = document.getElementById('csv-file-input');
  const loadDemoBtn = document.getElementById('load-demo-btn');
  const resetUploadBtn = document.getElementById('reset-upload-btn');
  
  // Drag & Drop
  dropZone.addEventListener('click', () => fileInput.click());
  
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
  });
  
  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('dragover');
  });
  
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    if (e.dataTransfer.files.length > 0) {
      handleFile(e.dataTransfer.files[0]);
    }
  });
  
  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      handleFile(e.target.files[0]);
    }
  });

  // Load Demo Data
  loadDemoBtn.addEventListener('load-demo', loadDemoData); // Custom trigger compatibility
  loadDemoBtn.addEventListener('click', loadDemoData);

  // Reset / Upload New
  resetUploadBtn.addEventListener('click', resetDashboard);

  // Explorer Table Controls
  document.getElementById('table-search').addEventListener('input', applyFiltersAndRender);
  document.getElementById('filter-type').addEventListener('change', applyFiltersAndRender);
  document.getElementById('filter-genre').addEventListener('change', applyFiltersAndRender);
  document.getElementById('filter-rating').addEventListener('change', applyFiltersAndRender);

  // Sorting columns
  const tableHeaders = document.querySelectorAll('.main-table th');
  tableHeaders.forEach(th => {
    th.addEventListener('click', () => {
      const column = th.getAttribute('data-sort');
      if (!column) return;
      
      if (currentSort.column === column) {
        currentSort.ascending = !currentSort.ascending;
      } else {
        currentSort.column = column;
        currentSort.ascending = true;
      }

      // Update Header Classes
      tableHeaders.forEach(header => {
        header.classList.remove('sort-asc', 'sort-desc');
      });
      th.classList.add(currentSort.ascending ? 'sort-asc' : 'sort-desc');

      sortFilteredData();
      currentPage = 1;
      renderTable();
    });
  });

  // Pagination buttons
  document.getElementById('btn-prev-page').addEventListener('click', () => {
    if (currentPage > 1) {
      currentPage--;
      renderTable();
    }
  });

  document.getElementById('btn-next-page').addEventListener('click', () => {
    const totalPages = Math.ceil(filteredData.length / rowsPerPage);
    if (currentPage < totalPages) {
      currentPage++;
      renderTable();
    }
  });
}

// Load Demo Data
function loadDemoData() {
  movieData = IMDB_DEMO_DATA;
  document.getElementById('data-source-text').textContent = 'Demo Data';
  const badge = document.getElementById('active-data-badge');
  badge.className = 'data-source-badge'; // reset style
  badge.style.display = 'inline-flex';
  
  initializeDashboard();
}

// Reset Dashboard
function resetDashboard() {
  // Clear file inputs
  document.getElementById('csv-file-input').value = '';
  
  // Transition screens
  document.getElementById('dashboard-screen').style.display = 'none';
  document.getElementById('welcome-screen').style.display = 'flex';
  document.getElementById('reset-upload-btn').style.display = 'none';
  document.getElementById('active-data-badge').style.display = 'none';
  
  // Destroy existing charts
  destroyCharts();
  
  movieData = [];
  filteredData = [];
}

// Destroy all charts safely
function destroyCharts() {
  Object.keys(charts).forEach(key => {
    if (charts[key]) {
      charts[key].destroy();
      charts[key] = null;
    }
  });
}

// Handle File upload
function handleFile(file) {
  if (!file.name.endsWith('.csv')) {
    alert('Invalid file format. Please upload a valid CSV file.');
    return;
  }

  const reader = new FileReader();
  reader.onload = function(e) {
    const csvContent = e.target.result;
    parseCSV(csvContent);
  };
  reader.readAsText(file);
}

// Parse CSV content using PapaParse
function parseCSV(csvContent) {
  Papa.parse(csvContent, {
    header: true,
    dynamicTyping: true,
    skipEmptyLines: true,
    complete: function(results) {
      if (results.errors.length > 0) {
        console.warn('PapaParse warnings:', results.errors);
      }
      
      if (results.data.length === 0) {
        alert('The uploaded CSV file appears to be empty.');
        return;
      }
      
      const normalized = normalizeData(results.data);
      if (normalized.length === 0) {
        alert('Could not find compatible IMDb column headers in the uploaded CSV.');
        return;
      }
      
      movieData = normalized;
      
      // Update badge
      document.getElementById('data-source-text').textContent = 'User Import';
      const badge = document.getElementById('active-data-badge');
      badge.className = 'data-source-badge user-data';
      badge.style.display = 'inline-flex';
      
      initializeDashboard();
    },
    error: function(err) {
      alert('Error parsing CSV file: ' + err.message);
    }
  });
}

// Normalizes IMDb CSV headers
function normalizeData(rawData) {
  const normalized = [];
  
  // Find which column mapping is matched
  const getVal = (row, possibleKeys) => {
    const key = Object.keys(row).find(k => 
      possibleKeys.includes(k.toLowerCase().trim())
    );
    return key !== undefined ? row[key] : null;
  };
  
  rawData.forEach(row => {
    // We require at least a title to consider it a valid row
    const titleVal = getVal(row, columnMappings.title);
    if (!titleVal) return;
    
    const item = {};
    item.Const = getVal(row, columnMappings.const) || '';
    item.Title = String(titleVal);
    item.URL = getVal(row, columnMappings.url) || `https://www.imdb.com/find?q=${encodeURIComponent(item.Title)}`;
    
    const typeVal = getVal(row, columnMappings.titleType);
    item['Title Type'] = typeVal ? String(typeVal) : 'Movie';
    
    // Numeric ratings
    const userRatingVal = getVal(row, columnMappings.yourRating);
    item['Your Rating'] = userRatingVal !== null && userRatingVal !== '' ? parseInt(userRatingVal) : null;
    
    const imdbRatingVal = getVal(row, columnMappings.imdbRating);
    item['IMDb Rating'] = imdbRatingVal !== null && imdbRatingVal !== '' ? parseFloat(imdbRatingVal) : null;
    
    // Runtime
    const runtimeVal = getVal(row, columnMappings.runtime);
    item['Runtime (mins)'] = runtimeVal !== null && runtimeVal !== '' ? parseInt(runtimeVal) : 0;
    
    // Year
    const yearVal = getVal(row, columnMappings.year);
    item.Year = yearVal !== null && yearVal !== '' ? parseInt(yearVal) : null;
    
    // Num Votes
    const numVotesVal = getVal(row, columnMappings.numVotes);
    item['Num Votes'] = numVotesVal !== null && numVotesVal !== '' ? parseInt(numVotesVal) : 0;
    
    // Dates & Meta
    const dateRatedVal = getVal(row, columnMappings.dateRated);
    item['Date Rated'] = dateRatedVal ? String(dateRatedVal).split(' ')[0] : null;
    
    const releaseVal = getVal(row, columnMappings.releaseDate);
    item['Release Date'] = releaseVal ? String(releaseVal).split(' ')[0] : null;
    
    item.Genres = String(getVal(row, columnMappings.genres) || 'Drama');
    item.Directors = String(getVal(row, columnMappings.directors) || '');
    
    normalized.push(item);
  });
  
  return normalized;
}

// Main logic to load and calculate analytics
function initializeDashboard() {
  // Screens transition
  document.getElementById('welcome-screen').style.display = 'none';
  document.getElementById('dashboard-screen').style.display = 'flex';
  document.getElementById('reset-upload-btn').style.display = 'inline-flex';

  // Calculate Metrics
  calculateKPIs();

  // Populate Dropdown Filters
  populateFilters();

  // Calculate Insights
  calculateInsights();

  // Draw Charts
  renderCharts();

  // Explorer Table Init
  applyFiltersAndRender();
}

// Compute simple KPIs
function calculateKPIs() {
  // Total Watched
  const total = movieData.length;
  document.getElementById('kpi-total-watched').textContent = total.toLocaleString();

  // Average User Rating
  const userRatings = movieData.filter(m => m['Your Rating'] !== null).map(m => m['Your Rating']);
  let avgUser = 0;
  if (userRatings.length > 0) {
    avgUser = userRatings.reduce((sum, r) => sum + r, 0) / userRatings.length;
  } else {
    // If user ratings are missing (watchlist mode), fallback to IMDb avg rating
    const imdbRatings = movieData.filter(m => m['IMDb Rating'] !== null).map(m => m['IMDb Rating']);
    if (imdbRatings.length > 0) {
      avgUser = imdbRatings.reduce((sum, r) => sum + r, 0) / imdbRatings.length;
      document.querySelector('.kpi-card.cyan .kpi-label').textContent = 'Avg IMDb Rating';
    }
  }
  document.getElementById('kpi-user-rating').textContent = avgUser.toFixed(1);

  // Total Estimated Watch Time
  const totalMins = movieData.reduce((sum, m) => sum + (m['Runtime (mins)'] || 0), 0);
  const days = Math.floor(totalMins / 1440);
  const hours = Math.floor((totalMins % 1440) / 60);
  
  if (days > 0) {
    document.getElementById('kpi-watch-time').textContent = `${days}d ${hours}h`;
  } else {
    document.getElementById('kpi-watch-time').textContent = `${hours}h`;
  }

  // Taste Divergence (Mean Absolute Error between User and IMDb Rating)
  let totalDiff = 0;
  let countWithBoth = 0;
  movieData.forEach(m => {
    if (m['Your Rating'] !== null && m['IMDb Rating'] !== null) {
      totalDiff += Math.abs(m['Your Rating'] - m['IMDb Rating']);
      countWithBoth++;
    }
  });
  
  const divergenceVal = countWithBoth > 0 ? (totalDiff / countWithBoth) : 0;
  document.getElementById('kpi-divergence').textContent = divergenceVal.toFixed(2);
}

// Populate Filters Dropdown dynamically
function populateFilters() {
  const typeFilter = document.getElementById('filter-type');
  const genreFilter = document.getElementById('filter-genre');

  // Reset options
  typeFilter.innerHTML = '<option value="all">All Types</option>';
  genreFilter.innerHTML = '<option value="all">All Genres</option>';

  // Collect unique title types
  const types = [...new Set(movieData.map(m => m['Title Type']).filter(Boolean))].sort();
  types.forEach(t => {
    const opt = document.createElement('option');
    opt.value = t;
    opt.textContent = t;
    typeFilter.appendChild(opt);
  });

  // Collect unique genres
  const allGenres = [];
  movieData.forEach(m => {
    if (m.Genres) {
      m.Genres.split(',').forEach(g => {
        const cleaned = g.trim();
        if (cleaned) allGenres.push(cleaned);
      });
    }
  });
  const uniqueGenres = [...new Set(allGenres)].sort();
  uniqueGenres.forEach(g => {
    const opt = document.createElement('option');
    opt.value = g;
    opt.textContent = g;
    genreFilter.appendChild(opt);
  });
}

// Calculate Anomalies & Preferences
function calculateInsights() {
  // 1. Hidden Gems (User Rating >= 8, IMDb Rating <= 6.5)
  const gemsList = document.getElementById('hidden-gems-list');
  gemsList.innerHTML = '';
  
  const gems = movieData.filter(m => 
    m['Your Rating'] !== null && 
    m['IMDb Rating'] !== null &&
    m['Your Rating'] >= 8 &&
    m['IMDb Rating'] <= 6.5
  ).sort((a, b) => b['Your Rating'] - a['Your Rating'] || a['IMDb Rating'] - b['IMDb Rating']);

  if (gems.length === 0) {
    gemsList.innerHTML = `
      <div class="insight-empty">
        <svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
        <span>No ratings match this filter (ratings match IMDb averages closely).</span>
      </div>
    `;
  } else {
    gems.slice(0, 8).forEach(gem => {
      const item = document.createElement('div');
      item.className = 'insight-item';
      item.innerHTML = `
        <div class="insight-movie-info">
          <span class="insight-movie-title" title="${gem.Title}">${gem.Title}</span>
          <span class="insight-movie-meta">${gem.Year} &bull; ${gem['Title Type']} &bull; ${gem.Genres}</span>
        </div>
        <div class="insight-ratings">
          <span class="badge-rating badge-user" title="Your Rating"><svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>${gem['Your Rating']}</span>
          <span class="badge-rating badge-imdb" title="IMDb Rating"><svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>${gem['IMDb Rating']}</span>
        </div>
      `;
      gemsList.appendChild(item);
    });
  }

  // 2. Overrated Disappointments (User Rating <= 5, IMDb Rating >= 7.5)
  const disList = document.getElementById('disappointments-list');
  disList.innerHTML = '';
  
  const disappointments = movieData.filter(m => 
    m['Your Rating'] !== null && 
    m['IMDb Rating'] !== null &&
    m['Your Rating'] <= 5 &&
    m['IMDb Rating'] >= 7.5
  ).sort((a, b) => a['Your Rating'] - b['Your Rating'] || b['IMDb Rating'] - a['IMDb Rating']);

  if (disappointments.length === 0) {
    disList.innerHTML = `
      <div class="insight-empty">
        <svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
        <span>No ratings match this filter.</span>
      </div>
    `;
  } else {
    disappointments.slice(0, 8).forEach(dis => {
      const item = document.createElement('div');
      item.className = 'insight-item';
      item.innerHTML = `
        <div class="insight-movie-info">
          <span class="insight-movie-title" title="${dis.Title}">${dis.Title}</span>
          <span class="insight-movie-meta">${dis.Year} &bull; ${dis['Title Type']} &bull; ${dis.Genres}</span>
        </div>
        <div class="insight-ratings">
          <span class="badge-rating badge-user" title="Your Rating"><svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>${dis['Your Rating']}</span>
          <span class="badge-rating badge-imdb" title="IMDb Rating"><svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>${dis['IMDb Rating']}</span>
        </div>
      `;
      disList.appendChild(item);
    });
  }

  // 3. Top Directors
  const dirBody = document.getElementById('top-directors-list');
  dirBody.innerHTML = '';
  
  const directorStats = {};
  movieData.forEach(m => {
    if (m.Directors && m['Your Rating'] !== null) {
      const dirs = m.Directors.split(',').map(d => d.trim()).filter(Boolean);
      dirs.forEach(d => {
        if (!directorStats[d]) {
          directorStats[d] = { count: 0, sumRating: 0 };
        }
        directorStats[d].count++;
        directorStats[d].sumRating += m['Your Rating'];
      });
    }
  });

  const directorsArr = Object.keys(directorStats).map(d => ({
    name: d,
    count: directorStats[d].count,
    avgRating: directorStats[d].sumRating / directorStats[d].count
  }));

  // Filter directors: if there are directors with >= 2 movies, use that filter. Otherwise count >= 1.
  const maxDirCount = Math.max(...directorsArr.map(d => d.count), 0);
  const minCountCutoff = maxDirCount > 1 ? 2 : 1;
  const filteredDirs = directorsArr
    .filter(d => d.count >= minCountCutoff)
    .sort((a, b) => b.count - a.count || b.avgRating - a.avgRating);

  if (filteredDirs.length === 0) {
    dirBody.innerHTML = '<tr><td colspan="3" style="text-align:center; color: var(--text-dark);">Insufficient director data available.</td></tr>';
  } else {
    filteredDirs.slice(0, 5).forEach(dir => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td><strong style="color:#fff;">${dir.name}</strong></td>
        <td>${dir.count} film${dir.count > 1 ? 's' : ''}</td>
        <td>
          <span style="display:inline-flex; align-items:center; gap: 4px; font-weight:600; color: var(--accent-gold);">
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
            ${dir.avgRating.toFixed(1)}
          </span>
        </td>
      `;
      dirBody.appendChild(row);
    });
  }

  // 4. Genre Preferences (Average rating by genre)
  const genBody = document.getElementById('top-genres-pref-list');
  genBody.innerHTML = '';
  
  const genreStats = {};
  movieData.forEach(m => {
    if (m.Genres && m['Your Rating'] !== null) {
      m.Genres.split(',').forEach(g => {
        const cleaned = g.trim();
        if (cleaned) {
          if (!genreStats[cleaned]) {
            genreStats[cleaned] = { count: 0, sumRating: 0 };
          }
          genreStats[cleaned].count++;
          genreStats[cleaned].sumRating += m['Your Rating'];
        }
      });
    }
  });

  const genresArr = Object.keys(genreStats).map(g => ({
    name: g,
    count: genreStats[g].count,
    avgRating: genreStats[g].sumRating / genreStats[g].count
  }));

  // Show genres with at least 3 ratings (or fallback to count >= 1 if dataset is small)
  const maxGenreCount = Math.max(...genresArr.map(g => g.count), 0);
  const minGenCutoff = maxGenreCount >= 3 ? 3 : 1;
  const filteredGenres = genresArr
    .filter(g => g.count >= minGenCutoff)
    .sort((a, b) => b.avgRating - a.avgRating || b.count - a.count);

  if (filteredGenres.length === 0) {
    genBody.innerHTML = '<tr><td colspan="3" style="text-align:center; color: var(--text-dark);">Insufficient genre data available.</td></tr>';
  } else {
    filteredGenres.slice(0, 5).forEach(gen => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td><span class="genre-tag" style="background: var(--accent-purple-glow); border-color: var(--accent-purple); color: #fff;">${gen.name}</span></td>
        <td>${gen.count} titles</td>
        <td>
          <span style="display:inline-flex; align-items:center; gap: 4px; font-weight:600; color: var(--accent-purple);">
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
            ${gen.avgRating.toFixed(1)}
          </span>
        </td>
      `;
      genBody.appendChild(row);
    });
  }
}

// Generate all charts via ApexCharts
function renderCharts() {
  destroyCharts();

  // Color Definitions matching CSS variables
  const colorPurple = '#8b5cf6';
  const colorCyan = '#00f2fe';
  
  // 1. Ratings Distribution Chart
  const userDist = Array(10).fill(0);
  const imdbDist = Array(10).fill(0);
  
  movieData.forEach(m => {
    if (m['Your Rating'] !== null) {
      const val = Math.min(10, Math.max(1, Math.round(m['Your Rating'])));
      userDist[val - 1]++;
    }
    if (m['IMDb Rating'] !== null) {
      const val = Math.min(10, Math.max(1, Math.round(m['IMDb Rating'])));
      imdbDist[val - 1]++;
    }
  });

  const ratingsOpt = {
    series: [
      { name: 'Your Rating', data: userDist },
      { name: 'IMDb Rating', data: imdbDist }
    ],
    chart: {
      type: 'bar',
      height: 320,
      background: 'transparent',
      toolbar: { show: false },
      foreColor: '#9ca3af'
    },
    colors: [colorPurple, colorCyan],
    plotOptions: {
      bar: {
        horizontal: false,
        columnWidth: '55%',
        borderRadius: 4
      }
    },
    dataLabels: { enabled: false },
    stroke: { show: true, width: 2, colors: ['transparent'] },
    xaxis: {
      categories: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'],
      title: { text: 'Rating Value' }
    },
    yaxis: {
      title: { text: 'Count of Titles' }
    },
    fill: { opacity: 0.85 },
    tooltip: {
      theme: 'dark',
      y: { formatter: (val) => `${val} title(s)` }
    },
    grid: { borderColor: 'rgba(255,255,255,0.05)' },
    legend: { position: 'top', horizontalAlign: 'right' }
  };
  charts.ratings = new ApexCharts(document.querySelector("#chart-ratings"), ratingsOpt);
  charts.ratings.render();

  // 2. Top Genres Share (Donut Chart)
  const genreCounts = {};
  movieData.forEach(m => {
    if (m.Genres) {
      m.Genres.split(',').forEach(g => {
        const cleaned = g.trim();
        if (cleaned) {
          genreCounts[cleaned] = (genreCounts[cleaned] || 0) + 1;
        }
      });
    }
  });
  
  const sortedGenres = Object.keys(genreCounts)
    .map(key => ({ name: key, value: genreCounts[key] }))
    .sort((a, b) => b.value - a.value);

  const topGenres = sortedGenres.slice(0, 6);
  const otherSum = sortedGenres.slice(6).reduce((sum, g) => sum + g.value, 0);
  if (otherSum > 0) {
    topGenres.push({ name: 'Other', value: otherSum });
  }

  const genreLabels = topGenres.map(g => g.name);
  const genreSeries = topGenres.map(g => g.value);

  const genresOpt = {
    series: genreSeries,
    labels: genreLabels,
    chart: {
      type: 'donut',
      height: 320,
      background: 'transparent',
      foreColor: '#9ca3af'
    },
    colors: [colorPurple, colorCyan, '#f59e0b', '#10b981', '#ec4899', '#3b82f6', '#6b7280'],
    stroke: { colors: ['#0d0c15'], width: 2 },
    plotOptions: {
      pie: {
        donut: {
          size: '70%',
          labels: {
            show: true,
            total: {
              show: true,
              label: 'Total Watched',
              color: '#f3f4f6',
              formatter: () => movieData.length
            },
            value: { color: '#f3f4f6' }
          }
        }
      }
    },
    tooltip: { theme: 'dark' },
    legend: { position: 'bottom' }
  };
  charts.genres = new ApexCharts(document.querySelector("#chart-genres"), genresOpt);
  charts.genres.render();

  // 3. Release Years Distribution (Decades/Eras)
  const decadeCounts = {};
  movieData.forEach(m => {
    if (m.Year) {
      const dec = Math.floor(m.Year / 10) * 10;
      let label = `${dec}s`;
      if (dec < 1970) label = '< 1970';
      decadeCounts[label] = (decadeCounts[label] || 0) + 1;
    }
  });

  const decadeLabels = ['< 1970', '1970s', '1980s', '1990s', '2000s', '2010s', '2020s'];
  const decadeSeries = decadeLabels.map(l => decadeCounts[l] || 0);

  const decadesOpt = {
    series: [{ name: 'Titles Watched', data: decadeSeries }],
    chart: {
      type: 'area',
      height: 320,
      background: 'transparent',
      toolbar: { show: false },
      foreColor: '#9ca3af'
    },
    colors: [colorCyan],
    fill: {
      type: 'gradient',
      gradient: {
        shadeIntensity: 1,
        opacityFrom: 0.45,
        opacityTo: 0.05,
        stops: [0, 100]
      }
    },
    dataLabels: { enabled: false },
    stroke: { curve: 'smooth', width: 3 },
    xaxis: { categories: decadeLabels },
    yaxis: { labels: { formatter: (v) => Math.round(v) } },
    tooltip: { theme: 'dark' },
    grid: { borderColor: 'rgba(255,255,255,0.05)' }
  };
  charts.decades = new ApexCharts(document.querySelector("#chart-decades"), decadesOpt);
  charts.decades.render();

  // 4. Rating Timeline Chart (Ratings Logged Over Time)
  const ratedTimeData = movieData
    .filter(m => m['Date Rated'] && m['Your Rating'] !== null)
    .map(m => ({
      x: new Date(m['Date Rated']).getTime(),
      y: m['Your Rating'],
      title: m.Title
    }))
    .sort((a, b) => a.x - b.x);

  let timelineOpt = {};
  if (ratedTimeData.length === 0) {
    // If no Date Rated exists (watchlist export), let's map by Release Year
    const releaseTimeData = movieData
      .filter(m => m.Year && m['IMDb Rating'] !== null)
      .map(m => ({
        x: m.Year,
        y: m['IMDb Rating'],
        title: m.Title
      }))
      .sort((a, b) => a.x - b.x);

    // Roll up averages per year
    const years = [...new Set(releaseTimeData.map(d => d.x))];
    const yearAvgs = years.map(yr => {
      const matches = releaseTimeData.filter(d => d.x === yr);
      const avg = matches.reduce((sum, item) => sum + item.y, 0) / matches.length;
      return { x: yr, y: parseFloat(avg.toFixed(1)) };
    });

    timelineOpt = {
      series: [{ name: 'Avg Rating per Release Year', data: yearAvgs }],
      chart: {
        type: 'line',
        height: 320,
        background: 'transparent',
        toolbar: { show: false },
        foreColor: '#9ca3af'
      },
      colors: [colorPurple],
      stroke: { width: 3, curve: 'straight' },
      xaxis: { title: { text: 'Release Year' }, labels: { formatter: (v) => Math.round(v) } },
      yaxis: { min: 1, max: 10, tickAmount: 9 },
      tooltip: {
        theme: 'dark',
        x: { formatter: (v) => `Year: ${Math.round(v)}` }
      },
      grid: { borderColor: 'rgba(255,255,255,0.05)' }
    };
  } else {
    // Generate cumulative count over time
    let cumulative = 0;
    const cumulativeSeries = ratedTimeData.map(d => {
      cumulative++;
      return { x: d.x, y: cumulative };
    });

    timelineOpt = {
      series: [{ name: 'Total Watch Count', data: cumulativeSeries }],
      chart: {
        type: 'line',
        height: 320,
        background: 'transparent',
        toolbar: { show: false },
        foreColor: '#9ca3af'
      },
      colors: [colorPurple],
      stroke: { width: 3, curve: 'stepline' },
      xaxis: {
        type: 'datetime',
        title: { text: 'Rating Date' }
      },
      yaxis: { title: { text: 'Cumulative Titles Logged' } },
      tooltip: {
        theme: 'dark',
        x: { format: 'dd MMM yyyy' }
      },
      grid: { borderColor: 'rgba(255,255,255,0.05)' }
    };
  }
  
  charts.timeline = new ApexCharts(document.querySelector("#chart-timeline"), timelineOpt);
  charts.timeline.render();
}

// Filtering & Table Render Layer
function applyFiltersAndRender() {
  const searchQuery = document.getElementById('table-search').value.toLowerCase().trim();
  const selectedType = document.getElementById('filter-type').value;
  const selectedGenre = document.getElementById('filter-genre').value;
  const selectedRating = document.getElementById('filter-rating').value;

  filteredData = movieData.filter(m => {
    // Search filter
    const matchesSearch = !searchQuery || 
      m.Title.toLowerCase().includes(searchQuery) ||
      m.Directors.toLowerCase().includes(searchQuery);

    // Type filter
    const matchesType = selectedType === 'all' || m['Title Type'] === selectedType;

    // Genre filter
    const matchesGenre = selectedGenre === 'all' || 
      (m.Genres && m.Genres.split(',').map(g => g.trim().toLowerCase()).includes(selectedGenre.toLowerCase()));

    // Rating filter
    let matchesRating = true;
    if (selectedRating !== 'all') {
      const rating = m['Your Rating'] !== null ? m['Your Rating'] : m['IMDb Rating'];
      if (rating === null) {
        matchesRating = false;
      } else {
        if (selectedRating === '9-10') matchesRating = rating >= 9;
        else if (selectedRating === '7-8') matchesRating = rating >= 7 && rating < 9;
        else if (selectedRating === '5-6') matchesRating = rating >= 5 && rating < 7;
        else if (selectedRating === '1-4') matchesRating = rating < 5;
      }
    }

    return matchesSearch && matchesType && matchesGenre && matchesRating;
  });

  sortFilteredData();
  currentPage = 1;
  renderTable();
}

// Sort Filtered Data
function sortFilteredData() {
  const col = currentSort.column;
  const isAsc = currentSort.ascending;

  filteredData.sort((a, b) => {
    let valA = a[col];
    let valB = b[col];

    // Handle null values
    if (valA === null || valA === undefined) return isAsc ? 1 : -1;
    if (valB === null || valB === undefined) return isAsc ? -1 : 1;

    // String comparison (case insensitive)
    if (typeof valA === 'string') {
      valA = valA.toLowerCase();
      valB = valB.toLowerCase();
    }

    if (valA < valB) return isAsc ? -1 : 1;
    if (valA > valB) return isAsc ? 1 : -1;
    return 0;
  });
}

// Render Table Rows & Pagination buttons
function renderTable() {
  const tbody = document.getElementById('table-body');
  tbody.innerHTML = '';

  const totalRecords = filteredData.length;
  const totalPages = Math.ceil(totalRecords / rowsPerPage);

  // If no data
  if (totalRecords === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 40px; color: var(--text-dark);">No movies match your filters.</td></tr>';
    document.getElementById('table-info').textContent = 'Showing 0 to 0 of 0 entries';
    document.getElementById('btn-prev-page').disabled = true;
    document.getElementById('btn-next-page').disabled = true;
    document.getElementById('page-numbers').innerHTML = '';
    return;
  }

  // Slice for current page
  const startIndex = (currentPage - 1) * rowsPerPage;
  const endIndex = Math.min(startIndex + rowsPerPage, totalRecords);
  const pageData = filteredData.slice(startIndex, endIndex);

  pageData.forEach(m => {
    const tr = document.createElement('tr');
    
    // Genres HTML tags
    const genresHTML = m.Genres.split(',')
      .map(g => `<span class="genre-tag">${g.trim()}</span>`)
      .join('');

    // Ratings formatting
    const userRatingText = m['Your Rating'] !== null ? m['Your Rating'] : '-';
    const imdbRatingText = m['IMDb Rating'] !== null ? m['IMDb Rating'] : '-';
    const runtimeText = m['Runtime (mins)'] > 0 ? `${m['Runtime (mins)']} m` : '-';

    tr.innerHTML = `
      <td class="table-movie-title">
        <a href="${m.URL}" target="_blank" rel="noopener">
          ${m.Title}
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>
        </a>
      </td>
      <td>${m['Title Type']}</td>
      <td>
        <span style="font-weight: 600; color: ${m['Your Rating'] ? 'var(--text-main)' : 'var(--text-dark)'}">
          ${userRatingText}
        </span>
      </td>
      <td>
        <span style="display:inline-flex; align-items:center; gap: 4px; color: var(--accent-gold); font-weight:600;">
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
          ${imdbRatingText}
        </span>
      </td>
      <td>${runtimeText}</td>
      <td>${m.Year || '-'}</td>
      <td>${genresHTML}</td>
      <td>${m.Directors || '-'}</td>
    `;
    
    tbody.appendChild(tr);
  });

  // Table Info Label
  document.getElementById('table-info').textContent = 
    `Showing ${startIndex + 1} to ${endIndex} of ${totalRecords} entries`;

  // Enable/Disable navigation buttons
  document.getElementById('btn-prev-page').disabled = currentPage === 1;
  document.getElementById('btn-next-page').disabled = currentPage === totalPages;

  // Render Page Numbers list
  renderPageNumbers(totalPages);
}

// Render dynamic pagination number indicators
function renderPageNumbers(totalPages) {
  const container = document.getElementById('page-numbers');
  container.innerHTML = '';

  const maxVisiblePages = 5;
  let startPage = Math.max(1, currentPage - 2);
  let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);
  
  if (endPage - startPage + 1 < maxVisiblePages) {
    startPage = Math.max(1, endPage - maxVisiblePages + 1);
  }

  for (let i = startPage; i <= endPage; i++) {
    const btn = document.createElement('button');
    btn.className = `page-btn ${i === currentPage ? 'active' : ''}`;
    btn.textContent = i;
    btn.addEventListener('click', () => {
      currentPage = i;
      renderTable();
    });
    container.appendChild(btn);
  }
}
