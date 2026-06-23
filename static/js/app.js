// ==========================================================================
// Application State Management
// ==========================================================================
let state = {
    releases: [],          // Raw list of releases from API
    filteredReleases: [],  // Filtered list of releases based on active filters
    selectedIds: new Set(),// Selected note IDs for tweeting
    activeCategory: 'all', // Active category filter: 'all', 'Feature', etc.
    activeStatFilter: null,// Active stat card filter (e.g. 'feature', 'announcement')
    searchQuery: '',       // Active search term
    currentDraft: {        // Current tweet draft context
        sources: [],       // Array of release notes in the draft
        text: ''           // Current text in text area
    }
};

// Constant tags/hashtags for tweets
const TWEET_HASHTAGS = '#BigQuery #GoogleCloud';
const CHAR_LIMIT = 280;

// ==========================================================================
// DOM Elements Initialization
// ==========================================================================
document.addEventListener('DOMContentLoaded', () => {
    // Buttons
    const btnRefresh = document.getElementById('btn-refresh');
    const btnTweetSelected = document.getElementById('btn-tweet-selected');
    const btnClearSelection = document.getElementById('btn-clear-selection');
    const btnCloseModal = document.getElementById('btn-close-modal');
    const btnShortenTweet = document.getElementById('btn-shorten-tweet');
    const btnCopyTweet = document.getElementById('btn-copy-tweet');
    const btnPostTweet = document.getElementById('btn-post-tweet');
    const btnResetFilters = document.getElementById('btn-reset-filters');
    const btnClearAllFilters = document.getElementById('btn-clear-all-filters');

    // Controls
    const searchInput = document.getElementById('search-input');
    const categoryChips = document.querySelectorAll('#category-chips .chip');
    const statCards = document.querySelectorAll('.stat-card');
    const tweetTextarea = document.getElementById('tweet-textarea');
    const chkIncludeLink = document.getElementById('chk-include-link');
    const chkIncludeHashtags = document.getElementById('chk-include-hashtags');

    // Layout blocks
    const tweetModal = document.getElementById('tweet-modal');
    
    // Bind Event Listeners
    btnRefresh.addEventListener('click', () => fetchReleases(true));
    btnTweetSelected.addEventListener('click', () => openTweetModal(getSelectedReleases()));
    btnClearSelection.addEventListener('click', clearSelection);
    btnCloseModal.addEventListener('click', closeTweetModal);
    btnShortenTweet.addEventListener('click', autoShortenTweet);
    btnCopyTweet.addEventListener('click', copyTweetText);
    btnPostTweet.addEventListener('click', updateTweetLink);
    btnResetFilters.addEventListener('click', resetFilters);
    btnClearAllFilters.addEventListener('click', resetFilters);

    searchInput.addEventListener('input', debounce((e) => {
        state.searchQuery = e.target.value.trim().toLowerCase();
        applyFilters();
    }, 250));

    // Category chips click handler
    categoryChips.forEach(chip => {
        chip.addEventListener('click', () => {
            categoryChips.forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            state.activeCategory = chip.dataset.category;
            // Deactivate stat card filter when category chip is clicked manually
            state.activeStatFilter = null;
            updateStatCardSelection();
            applyFilters();
        });
    });

    // Stat cards filtering behavior
    statCards.forEach(card => {
        card.addEventListener('click', () => {
            const filterType = card.dataset.filter;
            
            // Toggle filter off if clicked again
            if (state.activeStatFilter === filterType) {
                state.activeStatFilter = null;
            } else {
                state.activeStatFilter = filterType;
            }

            // Sync category chips with stat filter
            updateCategoryChipSelection();
            updateStatCardSelection();
            applyFilters();
        });
    });

    // Modal controls real-time content regeneration
    tweetTextarea.addEventListener('input', (e) => {
        state.currentDraft.text = e.target.value;
        updateCharCounter();
    });

    chkIncludeLink.addEventListener('change', () => {
        regenerateTweetText();
    });

    chkIncludeHashtags.addEventListener('change', () => {
        regenerateTweetText();
    });

    // Close modal on clicking overlay background
    tweetModal.addEventListener('click', (e) => {
        if (e.target === tweetModal) closeTweetModal();
    });

    // Initial Load
    fetchReleases(false);
});

// Helper to debounce inputs (prevent fast re-renders on keystrokes)
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// ==========================================================================
// Data Fetch & Parsing API
// ==========================================================================
function fetchReleases(forceRefresh = false) {
    const refreshIcon = document.getElementById('refresh-icon');
    const loadingState = document.getElementById('loading-state');
    const emptyState = document.getElementById('empty-state');
    const notesList = document.getElementById('notes-list');
    const feedStatus = document.getElementById('feed-status');

    // Show spinning loading state
    refreshIcon.classList.add('spinning');
    if (forceRefresh || state.releases.length === 0) {
        notesList.innerHTML = '';
        loadingState.style.display = 'flex';
        emptyState.style.display = 'none';
    }
    
    feedStatus.textContent = forceRefresh ? "Refreshing notes from Google Cloud..." : "Fetching cached notes...";

    const url = `/api/releases${forceRefresh ? '?refresh=true' : ''}`;

    fetch(url)
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
        })
        .then(res => {
            if (res.status === 'success') {
                state.releases = res.data;
                
                // Clear selection if it contains items that no longer exist
                const ids = new Set(res.data.map(item => item.id));
                state.selectedIds = new Set([...state.selectedIds].filter(id => ids.has(id)));
                
                // Update interface
                updateStats();
                applyFilters();
                updateSelectionPanel();
                
                const now = new Date();
                feedStatus.textContent = `Last updated: ${now.toLocaleTimeString()}`;
            } else {
                throw new Error(res.message || "Failed to load feed data");
            }
        })
        .catch(err => {
            console.error("Error fetching release notes:", err);
            feedStatus.textContent = "Failed to update feed. Showing cache.";
            showToast("Failed to fetch updates. Network issue.", true);
            
            // If we have no data, show empty state with error details
            if (state.releases.length === 0) {
                loadingState.style.display = 'none';
                emptyState.style.display = 'flex';
                emptyState.querySelector('h3').textContent = "Connection Error";
                emptyState.querySelector('p').textContent = "We couldn't reach the Google Cloud RSS feed. Please check your internet connection and try again.";
            }
        })
        .finally(() => {
            refreshIcon.classList.remove('spinning');
            loadingState.style.display = 'none';
        });
}

// ==========================================================================
// Statistics Counters
// ==========================================================================
function updateStats() {
    const stats = {
        all: state.releases.length,
        feature: 0,
        announcement: 0,
        breaking: 0,
        other: 0
    };

    state.releases.forEach(note => {
        const type = note.type.toLowerCase();
        if (type === 'feature') {
            stats.feature++;
        } else if (type === 'announcement') {
            stats.announcement++;
        } else if (type === 'breaking' || type === 'issue') {
            stats.breaking++;
        } else {
            stats.other++;
        }
    });

    // Bind stats to UI elements
    document.querySelector('#stat-all .stat-val').textContent = stats.all;
    document.querySelector('#stat-feature .stat-val').textContent = stats.feature;
    document.querySelector('#stat-announcement .stat-val').textContent = stats.announcement;
    document.querySelector('#stat-breaking .stat-val').textContent = stats.breaking;
    document.querySelector('#stat-other .stat-val').textContent = stats.other;
}

// Keep the active class of stat cards in sync with search selection
function updateStatCardSelection() {
    const statCards = document.querySelectorAll('.stat-card');
    statCards.forEach(card => {
        if (state.activeStatFilter === card.dataset.filter) {
            card.classList.add('active-filter');
        } else {
            card.classList.remove('active-filter');
        }
    });
}

// Synchronize category chips selection based on stat card click
function updateCategoryChipSelection() {
    const categoryChips = document.querySelectorAll('#category-chips .chip');
    categoryChips.forEach(chip => {
        chip.classList.remove('active');
    });

    if (state.activeStatFilter === 'all' || !state.activeStatFilter) {
        document.querySelector('#category-chips .chip[data-category="all"]').classList.add('active');
        state.activeCategory = 'all';
    } else if (state.activeStatFilter === 'feature') {
        document.querySelector('#category-chips .chip[data-category="Feature"]').classList.add('active');
        state.activeCategory = 'Feature';
    } else if (state.activeStatFilter === 'announcement') {
        document.querySelector('#category-chips .chip[data-category="Announcement"]').classList.add('active');
        state.activeCategory = 'Announcement';
    } else if (state.activeStatFilter === 'breaking') {
        // Breaking stat card covers both "Breaking" and "Issue" categories
        // We will default the chip display to "Breaking" chip but search criteria handles both
        document.querySelector('#category-chips .chip[data-category="Breaking"]').classList.add('active');
        state.activeCategory = 'Breaking';
    } else if (state.activeStatFilter === 'other') {
        // Others chip
        document.querySelector('#category-chips .chip[data-category="all"]').classList.add('active');
        state.activeCategory = 'other_types';
    }
}

// ==========================================================================
// Filtering Logic & Rendering Cards
// ==========================================================================
function applyFilters() {
    const notesList = document.getElementById('notes-list');
    const emptyState = document.getElementById('empty-state');
    const activeFiltersBar = document.getElementById('active-filters-bar');
    const activeFiltersList = document.getElementById('active-filters-list');

    // 1. Filter elements
    state.filteredReleases = state.releases.filter(note => {
        // Search term matches
        const matchesSearch = state.searchQuery === '' ||
            note.date.toLowerCase().includes(state.searchQuery) ||
            note.type.toLowerCase().includes(state.searchQuery) ||
            note.text.toLowerCase().includes(state.searchQuery);

        if (!matchesSearch) return false;

        // Category matches
        // If filtering via stat cards or chips
        if (state.activeStatFilter) {
            const type = note.type.toLowerCase();
            if (state.activeStatFilter === 'all') return true;
            if (state.activeStatFilter === 'feature') return type === 'feature';
            if (state.activeStatFilter === 'announcement') return type === 'announcement';
            if (state.activeStatFilter === 'breaking') return type === 'breaking' || type === 'issue';
            if (state.activeStatFilter === 'other') {
                return type !== 'feature' && type !== 'announcement' && type !== 'breaking' && type !== 'issue';
            }
        } else {
            // Check chip category filter
            if (state.activeCategory === 'all') return true;
            if (state.activeCategory === 'other_types') {
                const type = note.type.toLowerCase();
                return type !== 'feature' && type !== 'announcement' && type !== 'breaking' && type !== 'issue';
            }
            return note.type.toLowerCase() === state.activeCategory.toLowerCase();
        }

        return true;
    });

    // 2. Render active filters bar badges
    activeFiltersList.innerHTML = '';
    let hasFilters = false;

    if (state.searchQuery) {
        hasFilters = true;
        createFilterBadge(`Search: "${state.searchQuery}"`, () => {
            document.getElementById('search-input').value = '';
            state.searchQuery = '';
            applyFilters();
        });
    }

    if (state.activeStatFilter && state.activeStatFilter !== 'all') {
        hasFilters = true;
        createFilterBadge(`Section: ${capitalizeFirst(state.activeStatFilter)}`, () => {
            state.activeStatFilter = null;
            updateCategoryChipSelection();
            updateStatCardSelection();
            applyFilters();
        });
    } else if (state.activeCategory && state.activeCategory !== 'all') {
        hasFilters = true;
        createFilterBadge(`Category: ${state.activeCategory}`, () => {
            const allChip = document.querySelector('#category-chips .chip[data-category="all"]');
            allChip.click();
        });
    }

    activeFiltersBar.style.display = hasFilters ? 'flex' : 'none';

    // 3. Render list views
    if (state.filteredReleases.length === 0) {
        notesList.style.display = 'none';
        emptyState.style.display = 'flex';
        
        // Reset to normal empty text
        emptyState.querySelector('h3').textContent = "No releases match your criteria";
        emptyState.querySelector('p').textContent = "Try resetting filters or changing your search terms.";
    } else {
        notesList.style.display = 'flex';
        emptyState.style.display = 'none';
        
        // Generate Cards HTML
        renderNotesList();
    }
}

function createFilterBadge(text, onRemove) {
    const activeFiltersList = document.getElementById('active-filters-list');
    const badge = document.createElement('div');
    badge.className = 'active-filter-badge';
    badge.innerHTML = `
        <span>${text}</span>
        <i class="fa-solid fa-circle-xmark"></i>
    `;
    badge.querySelector('i').addEventListener('click', onRemove);
    activeFiltersList.appendChild(badge);
}

function capitalizeFirst(string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
}

function renderNotesList() {
    const notesList = document.getElementById('notes-list');
    notesList.innerHTML = '';

    state.filteredReleases.forEach(note => {
        const isSelected = state.selectedIds.has(note.id);
        const card = document.createElement('div');
        card.className = `note-card ${isSelected ? 'selected' : ''}`;
        card.dataset.id = note.id;
        
        // Match tag colors
        const badgeClass = getBadgeClass(note.type);

        card.innerHTML = `
            <!-- Selection Checkbox Column -->
            <div class="note-select-col">
                <div class="custom-checkbox">
                    <i class="fa-solid fa-check"></i>
                </div>
            </div>
            
            <!-- Note Content Area -->
            <div class="note-main-col">
                <div class="note-header">
                    <div class="note-meta">
                        <span class="badge ${badgeClass}">${note.type}</span>
                        <span class="note-date">
                            <i class="fa-regular fa-calendar-days"></i> ${note.date}
                        </span>
                    </div>
                    <div class="note-actions">
                        <a href="${note.link}" target="_blank" class="btn-card-link" title="Open official release notes page">
                            <i class="fa-solid fa-arrow-up-right-from-square"></i>
                        </a>
                        <button class="btn-card-tweet" title="Tweet this update">
                            <i class="fa-brands fa-x-twitter"></i>
                        </button>
                    </div>
                </div>
                <div class="note-body">
                    ${note.html}
                </div>
            </div>
        `;

        // Event: select card via checkbox click or click card background
        // Standard links and action buttons shouldn't trigger toggle Selection
        card.addEventListener('click', (e) => {
            if (e.target.closest('.note-actions') || e.target.closest('.note-body a')) {
                return;
            }
            toggleSelectNote(note.id);
        });

        // Event: Tweet button specifically clicked on card
        card.querySelector('.btn-card-tweet').addEventListener('click', (e) => {
            e.stopPropagation();
            openTweetModal([note]);
        });

        notesList.appendChild(card);
    });
}

function getBadgeClass(type) {
    const cleanType = type.toLowerCase();
    if (cleanType === 'feature') return 'badge-feature';
    if (cleanType === 'announcement') return 'badge-announcement';
    if (cleanType === 'breaking') return 'badge-breaking';
    if (cleanType === 'issue') return 'badge-issue';
    if (cleanType === 'change') return 'badge-change';
    if (cleanType === 'deprecated') return 'badge-deprecated';
    return 'badge-general';
}

// ==========================================================================
// Selection Management
// ==========================================================================
function toggleSelectNote(id) {
    if (state.selectedIds.has(id)) {
        state.selectedIds.delete(id);
    } else {
        state.selectedIds.add(id);
    }

    // Toggle selected class on card directly for fast visual feedback
    const card = document.querySelector(`.note-card[data-id="${id}"]`);
    if (card) {
        if (state.selectedIds.has(id)) {
            card.classList.add('selected');
        } else {
            card.classList.remove('selected');
        }
    }

    updateSelectionPanel();
}

function getSelectedReleases() {
    return state.releases.filter(note => state.selectedIds.has(note.id));
}

function clearSelection() {
    state.selectedIds.clear();
    
    // De-select all cards visually
    document.querySelectorAll('.note-card').forEach(card => {
        card.classList.remove('selected');
    });

    updateSelectionPanel();
}

function updateSelectionPanel() {
    const count = state.selectedIds.size;
    const selectCountEl = document.getElementById('select-count');
    const btnTweetSelected = document.getElementById('btn-tweet-selected');
    const btnClearSelection = document.getElementById('btn-clear-selection');

    selectCountEl.textContent = count;

    if (count > 0) {
        btnTweetSelected.disabled = false;
        btnClearSelection.disabled = false;
    } else {
        btnTweetSelected.disabled = true;
        btnClearSelection.disabled = true;
    }
}

function resetFilters() {
    document.getElementById('search-input').value = '';
    state.searchQuery = '';
    state.activeStatFilter = null;
    state.activeCategory = 'all';
    
    // Reset visual chip
    document.querySelectorAll('#category-chips .chip').forEach(chip => {
        chip.classList.remove('active');
    });
    document.querySelector('#category-chips .chip[data-category="all"]').classList.add('active');

    updateStatCardSelection();
    applyFilters();
}

// ==========================================================================
// Tweet Composer & Text Logic
// ==========================================================================
function openTweetModal(releaseNotes) {
    if (!releaseNotes || releaseNotes.length === 0) return;

    state.currentDraft.sources = releaseNotes;
    
    // Set UI sources container
    const sourcesContainer = document.getElementById('tweet-sources');
    sourcesContainer.innerHTML = '';
    
    releaseNotes.forEach(note => {
        const item = document.createElement('div');
        item.className = 'source-item';
        item.innerHTML = `
            <div class="source-left">
                <span class="badge ${getBadgeClass(note.type)} btn-sm">${note.type}</span>
                <span class="source-date">${note.date}</span>
                <span class="source-text-preview">${note.text}</span>
            </div>
        `;
        sourcesContainer.appendChild(item);
    });

    // Reset composer toggle options
    document.getElementById('chk-include-link').checked = true;
    document.getElementById('chk-include-hashtags').checked = true;

    // Generate initial text
    regenerateTweetText();

    // Show modal overlay
    const tweetModal = document.getElementById('tweet-modal');
    tweetModal.classList.add('open');
    tweetModal.style.display = 'flex';
}

function closeTweetModal() {
    const tweetModal = document.getElementById('tweet-modal');
    tweetModal.classList.remove('open');
    setTimeout(() => {
        tweetModal.style.display = 'none';
    }, 300); // Wait for transition fade
}

function regenerateTweetText() {
    const notes = state.currentDraft.sources;
    const includeLink = document.getElementById('chk-include-link').checked;
    const includeHashtags = document.getElementById('chk-include-hashtags').checked;
    
    let text = '';

    if (notes.length === 1) {
        // Single update tweet layout
        const note = notes[0];
        text = `BigQuery Release Note (${note.date}) 📢\n\n`;
        text += `[${note.type}]: ${note.text}\n\n`;
        
        if (includeLink && note.link) {
            text += `Details: ${note.link}\n`;
        }
    } else {
        // Multi-updates tweet summary layout
        text = `BigQuery Release Updates Summary 📢\n\n`;
        notes.forEach(note => {
            text += `• [${note.type}] (${note.date}): ${note.text}\n`;
        });
        text += `\n`;
        
        if (includeLink) {
            // Use standard main release notes URL if compiling multiple notes
            text += `All Details: https://docs.cloud.google.com/bigquery/docs/release-notes\n`;
        }
    }

    if (includeHashtags) {
        text += `${TWEET_HASHTAGS}`;
    }

    state.currentDraft.text = text.trim();
    
    // Set text to editor
    const tweetTextarea = document.getElementById('tweet-textarea');
    tweetTextarea.value = state.currentDraft.text;
    updateCharCounter();
}

function updateCharCounter() {
    const length = state.currentDraft.text.length;
    const counter = document.getElementById('char-counter');
    counter.textContent = `${length} / ${CHAR_LIMIT}`;

    counter.className = 'char-counter';
    if (length > CHAR_LIMIT) {
        counter.classList.add('danger');
    } else if (length > CHAR_LIMIT - 30) {
        counter.classList.add('warning');
    }
}

// Smart Auto-Shorten Algorithm
function autoShortenTweet() {
    const notes = state.currentDraft.sources;
    const includeLink = document.getElementById('chk-include-link').checked;
    const includeHashtags = document.getElementById('chk-include-hashtags').checked;

    if (state.currentDraft.text.length <= CHAR_LIMIT) {
        showToast("Tweet is already within limit!");
        return;
    }

    let text = '';
    
    if (notes.length === 1) {
        const note = notes[0];
        // Calculate constant length of headers and hashtags/links
        let headerText = `BigQuery Release Note (${note.date}) 📢\n\n[${note.type}]: `;
        let footerText = '\n';
        
        if (includeLink && note.link) {
            footerText += `\nDetails: ${note.link}`;
        }
        if (includeHashtags) {
            footerText += `\n${TWEET_HASHTAGS}`;
        }

        const constantLen = headerText.length + footerText.length;
        const availableTextLen = CHAR_LIMIT - constantLen - 4; // reserve space for "..."
        
        if (availableTextLen > 10) {
            // Cut the note text at a clean word boundary
            let mainNoteText = note.text;
            if (mainNoteText.length > availableTextLen) {
                let truncated = mainNoteText.substring(0, availableTextLen);
                // Cut at last space to avoid broken words
                const lastSpace = truncated.lastIndexOf(' ');
                if (lastSpace > 10) {
                    truncated = truncated.substring(0, lastSpace);
                }
                mainNoteText = truncated + '...';
            }
            text = headerText + mainNoteText + footerText;
        } else {
            // Very small space, just truncate as much as possible
            text = (headerText + note.text).substring(0, CHAR_LIMIT - 3) + '...';
        }
    } else {
        // Multi-select updates shortening
        // We'll shorten each bullet point proportionally or truncate bullet items
        let headerText = `BigQuery Release Updates Summary 📢\n\n`;
        let footerText = '\n';
        
        if (includeLink) {
            footerText += `All Details: https://docs.cloud.google.com/bigquery/docs/release-notes\n`;
        }
        if (includeHashtags) {
            footerText += `${TWEET_HASHTAGS}`;
        }

        const constantLen = headerText.length + footerText.length;
        const availableLen = CHAR_LIMIT - constantLen;
        
        // We will build bullet points one by one. If it exceeds, we drop subsequent bullet points and write "...and N more"
        let bulletTexts = [];
        notes.forEach(note => {
            bulletTexts.push(`• [${note.type}] (${note.date}): ${note.text}`);
        });

        let currentBulletBlock = '';
        let addedCount = 0;

        for (let i = 0; i < bulletTexts.length; i++) {
            let nextBullet = bulletTexts[i] + '\n';
            let potentialBlock = currentBulletBlock + nextBullet;
            
            // Allow some buffer for "and N more" text
            let remainingNotes = bulletTexts.length - (i + 1);
            let suffix = remainingNotes > 0 ? `\n...and ${remainingNotes} more updates.` : '';
            
            if ((potentialBlock + suffix).length <= availableLen) {
                currentBulletBlock += nextBullet;
                addedCount++;
            } else {
                // Cannot fit this bullet fully. Try to fit a shortened version of it if it's the first one,
                // otherwise add suffix and stop.
                if (i === 0) {
                    // Try to truncate the single bullet point
                    let singleBullet = bulletTexts[0];
                    let limit = availableLen - suffix.length - 4; // reserves space
                    if (limit > 20) {
                        currentBulletBlock = singleBullet.substring(0, limit) + '...\n';
                        addedCount++;
                    }
                }
                break;
            }
        }

        let remainingNotes = notes.length - addedCount;
        let suffix = remainingNotes > 0 ? `...and ${remainingNotes} more updates.\n` : '';
        
        text = headerText + currentBulletBlock + suffix + footerText;
    }

    state.currentDraft.text = text.trim();
    document.getElementById('tweet-textarea').value = state.currentDraft.text;
    updateCharCounter();
    showToast("Tweet auto-shortened to fit character limit!");
}

function copyTweetText() {
    const text = document.getElementById('tweet-textarea').value;
    navigator.clipboard.writeText(text)
        .then(() => {
            const btnCopyTweet = document.getElementById('btn-copy-tweet');
            const copyText = document.getElementById('copy-text');
            
            // Swap checkmark button temporarily
            copyText.textContent = "Copied!";
            btnCopyTweet.querySelector('i').className = "fa-solid fa-check";
            btnCopyTweet.classList.add('btn-accent');
            
            showToast("Tweet text copied to clipboard!");

            setTimeout(() => {
                copyText.textContent = "Copy Text";
                btnCopyTweet.querySelector('i').className = "fa-solid fa-copy";
                btnCopyTweet.classList.remove('btn-accent');
            }, 2000);
        })
        .catch(err => {
            console.error("Could not copy text:", err);
            showToast("Failed to copy text automatically.", true);
        });
}

function updateTweetLink() {
    const text = document.getElementById('tweet-textarea').value;
    const btnPostTweet = document.getElementById('btn-post-tweet');
    btnPostTweet.href = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
}

// ==========================================================================
// User Interface Notifications (Toast)
// ==========================================================================
function showToast(message, isError = false) {
    const toast = document.getElementById('toast-notification');
    const toastIcon = toast.querySelector('.toast-icon');
    const toastMessage = toast.querySelector('.toast-message');

    toastMessage.textContent = message;
    
    if (isError) {
        toastIcon.className = "fa-solid fa-circle-xmark";
        toastIcon.style.color = "var(--color-breaking)";
        toast.style.borderColor = "var(--color-breaking)";
    } else {
        toastIcon.className = "fa-solid fa-circle-check";
        toastIcon.style.color = "var(--accent-cyan)";
        toast.style.borderColor = "var(--accent-cyan)";
    }

    toast.classList.add('show');

    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}
