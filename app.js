        const API_PUBLIC = 'https://public.api.bsky.app/xrpc';
        const THEME_STORAGE_KEY = 'glimpsky-theme';
        const PREFERRED_ORIGIN = 'https://glimpsky.oblachek.eu';
        const ANALYTICS_RANGE_DEFAULT = '30d';
        
        let currentHandle = '';
        let currentDid = '';
        let currentPdsUrl = '';
        let currentDidDoc = null;
        let currentProfile = null;
        let currentCursor = null;
        let currentMode = 'posts';
        let isLoading = false;
        let allPosts = [];
        let allPostsLoaded = false;
        let latestPostDate = null;
        let latestLikeDate = null;
        let joinedDate = null;
        let identityUpdatedDate = null;
        let identityUpdateType = '';
        let latestFollowDate = null;
        let latestRepostDate = null;
        let accountInfoToken = 0;
        let joinedLoaded = false;
        let lastActiveLoaded = false;
        let identityUpdateLoaded = false;
        let pendingSortOldest = false;
        let analyticsExpanded = false;
        let analyticsRangePreset = ANALYTICS_RANGE_DEFAULT;
        let likesTimelineMainOnly = false;
        let visualizationTransitionTimer = null;
        let pendingListFromUrl = '';
        let autoOpenedListKey = '';
        const likesCountCache = new Map();
        const mutualsCache = new Map();
        const blockingCountCache = new Map();
        const recentStatsCache = new Map();

        const elements = {
            handleInput: document.getElementById('handle'),
            loadPostsBtn: document.getElementById('loadPostsBtn'),
            loadLikesBtn: document.getElementById('loadLikesBtn'),
            loadMoreBtn: document.getElementById('loadMoreBtn'),
            loadMoreContainer: document.getElementById('loadMoreContainer'),
            hideReposts: document.getElementById('hideReposts'),
            hideReplies: document.getElementById('hideReplies'),
            onlyLinks: document.getElementById('onlyLinks'),
            hideQuotes: document.getElementById('hideQuotes'),
            sortOldest: document.getElementById('sortOldest'),
            profileCard: document.getElementById('profileCard'),
            contentSection: document.getElementById('contentSection'),
            content: document.getElementById('content'),
            visualizations: document.getElementById('visualizations'),
            coverageHint: document.getElementById('coverageHint'),
            analyticsToggleBtn: document.getElementById('analyticsToggleBtn'),
            error: document.getElementById('error'),
            sectionTitle: document.getElementById('sectionTitle'),
            listModal: document.getElementById('listModal'),
            listModalTitle: document.getElementById('listModalTitle'),
            listModalMeta: document.getElementById('listModalMeta'),
            listModalList: document.getElementById('listModalList'),
            listModalClose: document.getElementById('listModalClose'),
            listModalLoadMore: document.getElementById('listModalLoadMore'),
            listModalSearchWrap: document.getElementById('listModalSearchWrap'),
            listModalSearch: document.getElementById('listModalSearch'),
            listModalSearchAllBtn: document.getElementById('listModalSearchAllBtn'),
            listModalSearchHint: document.getElementById('listModalSearchHint'),
            infoModal: document.getElementById('infoModal'),
            infoBtn: document.getElementById('infoBtn'),
            themeToggleBtn: document.getElementById('themeToggleBtn'),
            infoModalClose: document.getElementById('infoModalClose'),
            shareToolBtn: document.getElementById('shareToolBtn'),
            shareBskyLink: document.getElementById('shareBskyLink'),
            mainTitle: document.getElementById('mainTitle'),
            dateFrom: document.getElementById('dateFrom'),
            dateTo: document.getElementById('dateTo'),
            searchText: document.getElementById('searchText'),
            searchAuthor: document.getElementById('searchAuthor'),
            advancedFiltersToggle: document.getElementById('advancedFiltersToggle'),
            advancedFiltersContent: document.getElementById('advancedFiltersContent'),
            filterBanner: document.getElementById('filterBanner'),
            filterLoadBtn: document.getElementById('filterLoadBtn'),
            filterCancelBtn: document.getElementById('filterCancelBtn'),
            handleSuggestions: document.getElementById('handleSuggestions')
        };

        elements.loadPostsBtn.addEventListener('click', () => loadContent('posts'));
        elements.loadLikesBtn.addEventListener('click', () => loadContent('likes'));
        elements.loadMoreBtn.addEventListener('click', loadMore);
        if (elements.analyticsToggleBtn) {
            elements.analyticsToggleBtn.addEventListener('click', () => {
                setAnalyticsExpanded(!analyticsExpanded);
                updateCoverageHint();
            });
        }
        elements.handleInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') loadContent('posts');
        });

        elements.handleInput.addEventListener('input', () => {
            queueHandleSuggestions(elements.handleInput.value);
            toggleClearButton(elements.handleInput);
        });

        function setAdvancedFiltersExpanded(expanded) {
            const isExpanded = Boolean(expanded);
            elements.advancedFiltersToggle.classList.toggle('expanded', isExpanded);
            elements.advancedFiltersContent.classList.toggle('expanded', isExpanded);
            elements.advancedFiltersToggle.setAttribute('aria-expanded', isExpanded ? 'true' : 'false');
        }

        function setAnalyticsToggleVisible(visible) {
            if (!elements.analyticsToggleBtn) return;
            elements.analyticsToggleBtn.classList.toggle('show', Boolean(visible));
            if (!visible) {
                elements.analyticsToggleBtn.classList.remove('expanded');
                elements.analyticsToggleBtn.setAttribute('aria-expanded', 'false');
            }
        }

        function setAnalyticsExpanded(expanded) {
            analyticsExpanded = Boolean(expanded);
            if (!elements.analyticsToggleBtn) return;

            elements.analyticsToggleBtn.classList.toggle('expanded', analyticsExpanded);
            elements.analyticsToggleBtn.setAttribute('aria-expanded', analyticsExpanded ? 'true' : 'false');

            const label = analyticsExpanded ? 'Hide analytics' : 'Show analytics';
            elements.analyticsToggleBtn.innerHTML = `<span class="analytics-toggle-label">${label}</span>`;

            if (elements.visualizations && elements.visualizations.innerHTML.trim()) {
                elements.visualizations.style.display = 'grid';
                elements.visualizations.classList.add('has-data');
                elements.visualizations.classList.toggle('is-open', analyticsExpanded);
                if (!analyticsExpanded) {
                    elements.visualizations.classList.remove('is-range-updating');
                }
            } else if (elements.visualizations) {
                elements.visualizations.classList.remove('has-data', 'is-open', 'is-range-updating');
                elements.visualizations.style.display = 'none';
            }
        }

        function pulseVisualizationRangeTransition() {
            if (!elements.visualizations || !elements.visualizations.classList.contains('is-open')) return;
            elements.visualizations.classList.add('is-range-updating');
            if (visualizationTransitionTimer) {
                clearTimeout(visualizationTransitionTimer);
            }
            visualizationTransitionTimer = window.setTimeout(() => {
                if (elements.visualizations) {
                    elements.visualizations.classList.remove('is-range-updating');
                }
                visualizationTransitionTimer = null;
            }, 170);
        }

        function setLoadMoreVisible(visible) {
            const show = Boolean(visible);
            elements.loadMoreContainer.style.display = show ? 'block' : 'none';
            elements.content.classList.toggle('has-load-more', show);
            updateCoverageHint();
        }

        elements.sortOldest.addEventListener('change', () => {
            if (elements.sortOldest.checked && !allPostsLoaded) {
                pendingSortOldest = true;
                setAdvancedFiltersExpanded(true);
                elements.filterBanner.classList.add('show');
                return;
            }
            if (!elements.sortOldest.checked) {
                pendingSortOldest = false;
            }
            handleFilterChange();
        });
        
        let filterInputTimer = null;
        elements.searchText.addEventListener('input', () => {
            if (filterInputTimer) clearTimeout(filterInputTimer);
            filterInputTimer = setTimeout(() => {
                handleFilterChange();
            }, 250);
            toggleClearButton(elements.searchText);
        });

        elements.searchAuthor.addEventListener('input', () => {
            if (filterInputTimer) clearTimeout(filterInputTimer);
            filterInputTimer = setTimeout(() => {
                handleFilterChange();
            }, 250);
            toggleClearButton(elements.searchAuthor);
        });

        document.querySelectorAll('.clear-input').forEach(btn => {
            btn.addEventListener('click', async () => {
                const targetId = btn.getAttribute('data-clear-target');
                const input = targetId ? document.getElementById(targetId) : null;
                if (!input) return;
                input.value = '';
                toggleClearButton(input);
                if (input.id === 'handle') {
                    closeHandleSuggestions();
                } else {
                    await handleFilterChange();
                }
            });
        });

        elements.dateFrom.addEventListener('change', () => {
            handleFilterChange();
        });

        elements.dateTo.addEventListener('change', () => {
            handleFilterChange();
        });

        [elements.hideReposts, elements.hideReplies, elements.onlyLinks, elements.hideQuotes].forEach((checkbox) => {
            checkbox.addEventListener('change', () => {
                rerenderCurrentView();
            });
        });

        elements.filterLoadBtn.addEventListener('click', async () => {
            await loadAllPosts();
            if (allPostsLoaded) {
                elements.filterBanner.classList.remove('show');
                applyFiltersImmediate();
                pendingSortOldest = false;
            }
        });

        elements.filterCancelBtn.addEventListener('click', async () => {
            clearExpensiveFilters();
            elements.filterBanner.classList.remove('show');
            pendingSortOldest = false;
            await resetToPagedView();
        });


        elements.advancedFiltersToggle.addEventListener('click', () => {
            const next = !elements.advancedFiltersToggle.classList.contains('expanded');
            setAdvancedFiltersExpanded(next);
        });

        elements.infoBtn.addEventListener('click', () => {
            elements.infoModal.classList.add('open');
            elements.infoModal.setAttribute('aria-hidden', 'false');
        });

        elements.infoModalClose.addEventListener('click', () => {
            elements.infoModal.classList.remove('open');
            elements.infoModal.setAttribute('aria-hidden', 'true');
        });

        function getStoredTheme() {
            try {
                const stored = localStorage.getItem(THEME_STORAGE_KEY);
                return stored === 'dark' || stored === 'light' ? stored : null;
            } catch (e) {
                return null;
            }
        }

        function getPreferredTheme() {
            const stored = getStoredTheme();
            if (stored) return stored;
            return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        }

        function applyTheme(theme, persist = true) {
            const nextTheme = theme === 'dark' ? 'dark' : 'light';
            document.documentElement.setAttribute('data-theme', nextTheme);
            if (elements.themeToggleBtn) {
                const showMoon = nextTheme !== 'dark';
                elements.themeToggleBtn.classList.toggle('is-dark', nextTheme === 'dark');
                elements.themeToggleBtn.setAttribute('aria-label', showMoon ? 'Switch to dark mode' : 'Switch to light mode');
                elements.themeToggleBtn.setAttribute('aria-pressed', nextTheme === 'dark' ? 'true' : 'false');
            }
            if (persist) {
                try {
                    localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
                } catch (e) {
                    // ignore storage write failures
                }
            }
        }

        function initTheme() {
            applyTheme(getPreferredTheme(), false);
            if (elements.themeToggleBtn) {
                elements.themeToggleBtn.addEventListener('click', () => {
                    const current = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
                    applyTheme(current === 'dark' ? 'light' : 'dark');
                });
            }
        }

        function normalizePathname(pathname) {
            let path = pathname || '/';
            if (!path.startsWith('/')) path = `/${path}`;
            if (path.endsWith('/index.html')) {
                path = path.slice(0, -'index.html'.length) || '/';
            }
            return path || '/';
        }

        function getToolHomeUrl() {
            const url = new URL(window.location.href);
            url.search = '';
            url.hash = '';
            if (url.pathname.endsWith('/index.html')) {
                url.pathname = url.pathname.slice(0, -'index.html'.length);
            }
            return url.toString();
        }

        function getCanonicalHomeUrl() {
            const current = new URL(getToolHomeUrl());
            const isLocalhost = current.hostname === 'localhost' || current.hostname === '127.0.0.1';
            if (isLocalhost) return current.toString();
            const canonical = new URL(current.pathname || '/', PREFERRED_ORIGIN);
            return canonical.toString();
        }

        function syncSeoUrlTags(homeUrl) {
            const ogUrl = document.getElementById('ogUrl');
            if (ogUrl) {
                ogUrl.setAttribute('content', homeUrl);
            }

            const twitterUrl = document.getElementById('twitterUrl');
            if (twitterUrl) {
                twitterUrl.setAttribute('content', homeUrl);
            }

            const canonicalUrl = document.getElementById('canonicalUrl');
            if (canonicalUrl) {
                canonicalUrl.setAttribute('href', homeUrl);
            }

            const structuredData = document.getElementById('seoStructuredData');
            if (structuredData) {
                try {
                    const parsed = JSON.parse(structuredData.textContent || '{}');
                    parsed.url = homeUrl;
                    structuredData.textContent = JSON.stringify(parsed);
                } catch (e) {
                    // Ignore parse failures to avoid breaking app startup.
                }
            }
        }

        if (elements.shareToolBtn) {
            elements.shareToolBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                const url = getToolHomeUrl();
                try {
                    if (navigator.clipboard) {
                        await navigator.clipboard.writeText(url);
                        const original = elements.shareToolBtn.textContent;
                        elements.shareToolBtn.textContent = 'Copied';
                        setTimeout(() => {
                            elements.shareToolBtn.textContent = original;
                        }, 1200);
                    } else {
                        window.prompt('Copy this link:', url);
                    }
                } catch (e) {
                    showError('Could not copy link');
                }
            });
        }

        if (elements.shareBskyLink) {
            const url = getToolHomeUrl();
            const text = `GlimpSky - Bluesky Profile Viewer ${url}`;
            elements.shareBskyLink.href = `https://bsky.app/intent/compose?text=${encodeURIComponent(text)}`;
        }

        elements.infoModal.addEventListener('click', (e) => {
            if (e.target === elements.infoModal) {
                elements.infoModal.classList.remove('open');
                elements.infoModal.setAttribute('aria-hidden', 'true');
            }
        });

        elements.mainTitle.addEventListener('click', () => {
            elements.handleInput.value = '';
            closeHandleSuggestions();
            toggleClearButton(elements.handleInput);
            elements.profileCard.style.display = 'none';
            elements.contentSection.style.display = 'none';
            elements.content.innerHTML = '';
            clearVisualizations();
            updateCoverageHint();
            elements.error.innerHTML = '';
            currentHandle = '';
            currentDid = '';
            currentPdsUrl = '';
            currentDidDoc = null;
            currentProfile = null;
            currentCursor = null;
            currentMode = 'posts';
            allPosts = [];
            allPostsLoaded = false;
            latestPostDate = null;
            latestLikeDate = null;
            joinedDate = null;
            identityUpdatedDate = null;
            identityUpdateType = '';
            latestFollowDate = null;
            latestRepostDate = null;
            likesCountToken = 0;
            likesCountTruncated = false;
            likesCountExact = false;
            likesCountBusy = false;
            likesCountCache.clear();
            mutualsCache.clear();
            blockingCountCache.clear();
            recentStatsCache.clear();
            joinedLoaded = false;
            lastActiveLoaded = false;
            identityUpdateLoaded = false;
            elements.hideReposts.checked = true;
            elements.hideReplies.checked = false;
            elements.onlyLinks.checked = false;
            elements.hideQuotes.checked = false;
            elements.dateFrom.value = '';
            elements.dateTo.value = '';
            elements.searchText.value = '';
            elements.searchAuthor.value = '';
            toggleClearButton(elements.searchText);
            toggleClearButton(elements.searchAuthor);
            setAdvancedFiltersExpanded(false);
            elements.filterBanner.classList.remove('show');
            elements.sortOldest.checked = false;
            pendingSortOldest = false;
            likesTimelineMainOnly = false;
            updateModeButtons('posts');
            updateUrlParams('', 'posts');
        });

        document.addEventListener('click', (e) => {
            if (!elements.handleInput.contains(e.target) && !elements.handleSuggestions.contains(e.target)) {
                closeHandleSuggestions();
            }
        });

        function showError(message, showExample = false) {
            const extra = showExample ? ' or <a href="#" id="exampleProfileLink">try a sample profile</a>.' : '';
            elements.error.innerHTML = `<div class="error">${escapeHtml(message)}${extra}</div>`;
            if (showExample) {
                const exampleLink = document.getElementById('exampleProfileLink');
                if (exampleLink) {
                    exampleLink.addEventListener('click', async (e) => {
                        e.preventDefault();
                        elements.handleInput.value = 'bsky.app';
                        await loadContent('posts');
                    });
                }
            }
            setTimeout(() => {
                elements.error.innerHTML = '';
            }, 8000);
        }

        function showLoading() {
            clearVisualizations();
            elements.content.innerHTML = `
                <div class="loading">
                    <div class="spinner"></div>
                    <p>Loading...</p>
                </div>
            `;
        }

        function setLoading(loading) {
            isLoading = loading;
            elements.loadPostsBtn.disabled = loading;
            elements.loadLikesBtn.disabled = loading;
            elements.loadMoreBtn.disabled = loading;
        }

        async function resolveHandle(handle) {
            try {
                handle = handle.trim()
                    .replace('https://', '')
                    .replace('http://', '')
                    .replace('bsky.app/profile/', '')
                    .replace('@', '');

                if (handle.startsWith('did:')) {
                    return handle;
                }

                const response = await fetch(
                    `${API_PUBLIC}/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(handle)}`
                );
                
                if (!response.ok) {
                    throw new Error('Could not resolve handle. Please check if it exists.');
                }
                
                const data = await response.json();
                return data.did;
            } catch (error) {
                throw new Error(`Failed to resolve handle: ${error.message}`);
            }
        }

        async function getPdsUrl(did) {
            try {
                const didDoc = await fetchDidDocument(did);
                if (!didDoc) {
                    throw new Error('Could not fetch DID document');
                }
                currentDidDoc = didDoc;

                const services = Array.isArray(didDoc.service) ? didDoc.service : [];
                const pdsService = services.find((service) => {
                    if (!service || typeof service !== 'object') return false;
                    const id = typeof service.id === 'string' ? service.id : '';
                    const type = typeof service.type === 'string' ? service.type : '';
                    return id === '#atproto_pds' || id === `${did}#atproto_pds` || type === 'AtprotoPersonalDataServer';
                });
                if (!pdsService) {
                    throw new Error('No PDS service found in DID document');
                }
                
                return pdsService.serviceEndpoint;
            } catch (error) {
                throw new Error(`Failed to get PDS URL: ${error.message}`);
            }
        }

        async function fetchDidDocument(did) {
            if (!did) return null;

            const candidates = [];
            if (did.startsWith('did:web:')) {
                const didWebUrl = buildDidWebDocumentUrl(did);
                if (didWebUrl) {
                    candidates.push(didWebUrl);
                }
            }
            candidates.push(`https://plc.directory/${did}`);

            for (const url of candidates) {
                try {
                    const response = await fetch(url);
                    if (!response.ok) continue;
                    return await response.json();
                } catch (e) {
                    // Try next candidate URL.
                }
            }

            return null;
        }

        function buildDidWebDocumentUrl(did) {
            if (!did || !did.startsWith('did:web:')) return '';
            const methodSpecific = did.slice('did:web:'.length);
            if (!methodSpecific) return '';

            const rawSegments = methodSpecific.split(':');
            if (rawSegments.length === 0) return '';

            const decodeSafe = (value) => {
                try {
                    return decodeURIComponent(value);
                } catch (e) {
                    return value;
                }
            };

            const host = decodeSafe(rawSegments[0]);
            if (!host) return '';

            const pathSegments = rawSegments.slice(1).map((segment) => encodeURIComponent(decodeSafe(segment)));
            if (pathSegments.length === 0) {
                return `https://${host}/.well-known/did.json`;
            }

            return `https://${host}/${pathSegments.join('/')}/did.json`;
        }

        async function loadProfile(did) {
            try {
                const response = await fetch(
                    `${API_PUBLIC}/app.bsky.actor.getProfile?actor=${encodeURIComponent(did)}`
                );

                if (!response.ok) {
                    throw new Error('Could not load profile');
                }

                const profile = await response.json();
                currentProfile = profile;
                if (profile.createdAt) {
                    joinedDate = new Date(profile.createdAt);
                }
                displayProfile(profile);
                return profile;
            } catch (error) {
                throw new Error(`Failed to load profile: ${error.message}`);
            }
        }

        function displayProfile(profile) {
            const avatar = profile.avatar || 'https://via.placeholder.com/80';
            const displayName = profile.displayName || profile.handle;
            const description = profile.description || '';
            const descriptionHtml = description ? formatProfileDescription(profile) : '';
            const homePdsUrl = currentPdsUrl || '';
            const homePdsLabel = formatPdsLabel(homePdsUrl);

            elements.profileCard.innerHTML = `
                <div class="profile-header">
                    <img src="${avatar}" alt="${escapeHtml(displayName)}" class="avatar">
                    <div class="profile-info">
                        <div class="profile-topline">
                            <h2>${escapeHtml(displayName)}</h2>
                            <a class="copy-link-btn" href="https://bsky.app/profile/${escapeHtml(profile.handle)}" target="_blank" rel="noopener noreferrer">Open in Bluesky</a>
                        </div>
                        <div class="handle">@${escapeHtml(profile.handle)}</div>
                        ${descriptionHtml ? `<div class="description">${descriptionHtml}</div>` : ''}
                        <div class="account-info">
                            <div class="account-item">
                                <span class="account-label">Joined</span>
                                <span id="joinedDate">—</span>
                            </div>
                            <div class="account-item">
                                <span class="account-label">Account age</span>
                                <span id="accountAge">—</span>
                            </div>
                            <div class="account-item">
                                <span class="account-label">Last active</span>
                                <span id="lastActiveDate">—</span>
                            </div>
                            <div class="account-item">
                                <span class="account-label">Last follow</span>
                                <span id="lastFollowDate">—</span>
                            </div>
                            <div class="account-item">
                                <span class="account-label">Identity update</span>
                                <span id="identityUpdateDate">—</span>
                            </div>
                            <div class="account-item">
                                <span class="account-label">Home PDS</span>
                                ${homePdsUrl
                                    ? `<a class="account-value-link" href="${escapeHtml(homePdsUrl)}" target="_blank" rel="noopener noreferrer" title="${escapeHtml(homePdsUrl)}">${escapeHtml(homePdsLabel)}</a>`
                                    : '<span>—</span>'}
                            </div>
                        </div>
                        <div class="recent-activity">
                            <span class="account-label">Last 30d</span>
                            <span class="recent-item"><strong id="recentPosts30d">—</strong> posts</span>
                            <span class="recent-item"><strong id="recentLikes30d">—</strong> likes</span>
                            <span class="recent-item"><strong id="recentFollows30d">—</strong> follows</span>
                            <span class="recent-item"><strong id="recentReposts30d">—</strong> reposts</span>
                        </div>
                    </div>
                </div>

                <div class="stats">
                    <div class="stat">
                        <span class="stat-value">${formatNumber(profile.postsCount || 0)}</span>
                        <span class="stat-label">posts</span>
                    </div>
                    <button class="stat statButton" id="likesStat" type="button" title="Click to compute exact likes">
                        <span class="stat-value" id="likesCount">—</span>
                        <span class="stat-label">likes</span>
                    </button>
                    <button class="stat statButton" id="followersStat" type="button" title="Show followers">
                        <span class="stat-value">${formatNumber(profile.followersCount || 0)}</span>
                        <span class="stat-label">followers</span>
                    </button>
                    <button class="stat statButton" id="followingStat" type="button" title="Show following">
                        <span class="stat-value">${formatNumber(profile.followsCount || 0)}</span>
                        <span class="stat-label">following</span>
                    </button>
                    <button class="stat statButton" id="mutualsStat" type="button" title="Compute mutuals (can take a while on big accounts)">
                        <span class="stat-value" id="mutualsCount">—</span>
                        <span class="stat-label">mutuals</span>
                    </button>
                    <button class="stat statButton" id="blockingStat" type="button" title="Show accounts this user blocks">
                        <span class="stat-value" id="blockingCount">—</span>
                        <span class="stat-label">blocking</span>
                    </button>
                    <button class="stat statButton" id="blockedByStat" type="button" title="Show accounts that block this user">
                        <span class="stat-value" id="blockedByCount">—</span>
                        <span class="stat-label">blocked by</span>
                    </button>
                </div>
            `;
            elements.profileCard.style.display = 'block';

            wireProfileStatsButtons();
            primeMutualsAndBlocking();
            applyCachedLikesCount();
        }

        let listCursor = null;
        let listLoader = null;
        let listLoading = false;
        let listNote = '';
        let listProfiles = [];
        let listSearchQuery = '';
        let listSearchEnabled = true;
        let listLoadError = '';
        let listSearchLoadingAll = false;
        let listSearchHintOverride = '';

        function openListModal(title, note, loader, options = {}) {
            listCursor = null;
            listLoader = loader;
            listLoading = false;
            listNote = note || '';
            listProfiles = [];
            listSearchQuery = '';
            listLoadError = '';
            listSearchLoadingAll = false;
            listSearchHintOverride = '';
            listSearchEnabled = options.searchable !== false;
            elements.listModalTitle.textContent = title;
            elements.listModalMeta.textContent = listNote;
            elements.listModalMeta.style.display = listNote ? 'block' : 'none';
            elements.listModalList.innerHTML = '';
            elements.listModalLoadMore.style.display = 'none';
            if (elements.listModalSearch) {
                elements.listModalSearch.value = '';
            }
            setListSearchVisibility(listSearchEnabled);
            refreshListSearchControls();
            elements.listModal.classList.add('open');
            elements.listModal.setAttribute('aria-hidden', 'false');
            loadMoreList();
        }

        function setListSearchVisibility(visible) {
            if (!elements.listModalSearchWrap) return;
            elements.listModalSearchWrap.style.display = visible ? 'block' : 'none';
        }

        function setListSearchHint(message) {
            listSearchHintOverride = message || '';
            refreshListSearchControls();
        }

        function refreshListSearchControls() {
            if (!listSearchEnabled) {
                if (elements.listModalSearchAllBtn) {
                    elements.listModalSearchAllBtn.style.display = 'none';
                }
                if (elements.listModalSearchHint) {
                    elements.listModalSearchHint.textContent = '';
                    elements.listModalSearchHint.style.display = 'none';
                }
                return;
            }

            const hasQuery = Boolean(listSearchQuery);
            const hasMore = Boolean(listCursor);
            const isBusy = listLoading || listSearchLoadingAll;

            if (elements.listModalSearchAllBtn) {
                const showSearchAll = hasQuery && hasMore;
                elements.listModalSearchAllBtn.style.display = showSearchAll ? 'inline-flex' : 'none';
                elements.listModalSearchAllBtn.disabled = isBusy || !showSearchAll;
                elements.listModalSearchAllBtn.textContent = listSearchLoadingAll ? 'Loading…' : 'Search all';
            }

            if (elements.listModalSearchHint) {
                let hint = listSearchHintOverride;
                if (!hint && hasQuery && hasMore) {
                    hint = 'Searching loaded accounts only. Press Enter or Search all to load the full list (may take a while). Supports plain text and /regex/flags.';
                } else if (!hint && hasQuery && !hasMore && listProfiles.length > 0) {
                    hint = 'Full list loaded. Search supports plain text and /regex/flags.';
                }
                elements.listModalSearchHint.textContent = hint;
                elements.listModalSearchHint.style.display = hint ? 'block' : 'none';
            }
        }

        function closeListModal() {
            elements.listModal.classList.remove('open');
            elements.listModal.setAttribute('aria-hidden', 'true');
            elements.listModalList.innerHTML = '';
            elements.listModalMeta.textContent = '';
            elements.listModalMeta.style.display = 'none';
            listCursor = null;
            listLoader = null;
            listLoading = false;
            listNote = '';
            listProfiles = [];
            listSearchQuery = '';
            listLoadError = '';
            listSearchEnabled = true;
            listSearchLoadingAll = false;
            listSearchHintOverride = '';
            if (elements.listModalSearch) {
                elements.listModalSearch.value = '';
            }
            setListSearchVisibility(false);
            refreshListSearchControls();
        }

        async function loadMoreList() {
            if (!listLoader || listLoading || listSearchLoadingAll) return;
            listLoading = true;
            if (!listSearchLoadingAll) {
                listSearchHintOverride = '';
            }
            refreshListSearchControls();
            elements.listModalLoadMore.disabled = true;
            elements.listModalLoadMore.textContent = 'Loading…';
            try {
                const res = await listLoader(listCursor);
                const profiles = res?.profiles || [];
                listLoadError = '';
                renderProfileListItems(profiles);
                listCursor = res?.cursor || null;
                elements.listModalLoadMore.style.display = listCursor ? 'inline-flex' : 'none';
            } catch (e) {
                const msg = (e && e.message) ? e.message : String(e);
                listLoadError = msg;
                renderProfileListItems();
                elements.listModalLoadMore.style.display = 'none';
            } finally {
                listLoading = false;
                elements.listModalLoadMore.disabled = false;
                elements.listModalLoadMore.textContent = 'Load more';
                refreshListSearchControls();
            }
        }

        async function loadAllListPagesForSearch() {
            if (!listLoader || listSearchLoadingAll || listLoading || !listCursor) return;
            listSearchLoadingAll = true;
            setListSearchHint('Loading full list for search. This can take a while…');
            elements.listModalLoadMore.disabled = true;
            elements.listModalLoadMore.textContent = 'Loading…';

            try {
                while (listCursor) {
                    const res = await listLoader(listCursor);
                    const profiles = res?.profiles || [];
                    listLoadError = '';
                    appendUniqueProfiles(profiles);
                    listCursor = res?.cursor || null;
                    renderProfileListItems();
                    if (listCursor) {
                        setListSearchHint(`Loading full list… ${formatNumber(listProfiles.length)} accounts loaded`);
                    }
                }
                setListSearchHint(`Full list loaded (${formatNumber(listProfiles.length)} accounts).`);
            } catch (e) {
                const msg = (e && e.message) ? e.message : String(e);
                listLoadError = msg;
                setListSearchHint(`Could not finish loading full list: ${msg}`);
                renderProfileListItems();
            } finally {
                listSearchLoadingAll = false;
                elements.listModalLoadMore.disabled = false;
                elements.listModalLoadMore.textContent = 'Load more';
                elements.listModalLoadMore.style.display = listCursor ? 'inline-flex' : 'none';
                refreshListSearchControls();
            }
        }

        function renderProfileListItems(profiles = []) {
            if (profiles.length > 0) {
                appendUniqueProfiles(profiles);
            }

            const visibleProfiles = getFilteredListProfiles();
            if (visibleProfiles.length === 0) {
                if (listLoadError && listProfiles.length === 0) {
                    elements.listModalList.innerHTML = `
                        <div class="empty-state" style="padding: 16px 10px;">
                            <p>Failed to load list</p>
                            <p style="font-size: 13px; margin-top: 8px; color: var(--text-soft);">${escapeHtml(listLoadError)}</p>
                        </div>
                    `;
                    refreshListSearchControls();
                    return;
                }

                if (listSearchQuery && listProfiles.length > 0) {
                    elements.listModalList.innerHTML = `
                        <div class="empty-state" style="padding: 16px 10px;">
                            <p>No matching accounts</p>
                        </div>
                    `;
                    refreshListSearchControls();
                    return;
                }

                if (elements.listModalList.children.length > 0) {
                    refreshListSearchControls();
                    return;
                }

                elements.listModalList.innerHTML = `
                    <div class="empty-state" style="padding: 16px 10px;">
                        <p>Nothing here</p>
                    </div>
                `;
                refreshListSearchControls();
                return;
            }

            const html = visibleProfiles.map(p => {
                const avatar = p.avatar || 'https://via.placeholder.com/40';
                const name = p.displayName || p.handle || p.did || '';
                const handle = p.handle ? '@' + p.handle : (p.did || '');
                const actor = p.handle || p.did || '';
                return `
                    <div class="list-item" data-actor="${escapeHtml(actor)}">
                        <img class="list-avatar" src="${escapeHtml(avatar)}" alt="">
                        <div class="list-main">
                            <div class="list-name">${escapeHtml(name)}</div>
                            <div class="list-handle">${escapeHtml(handle)}</div>
                        </div>
                    </div>
                `;
            }).join('');

            elements.listModalList.innerHTML = html;

            [...elements.listModalList.querySelectorAll('.list-item')].forEach(el => {
                el.addEventListener('click', async () => {
                    const actor = el.getAttribute('data-actor');
                    closeListModal();
                    if (actor) {
                        elements.handleInput.value = actor;
                        await loadContent(currentMode);
                    }
                });
            });
            refreshListSearchControls();
        }

        function appendUniqueProfiles(profiles) {
            const seen = new Set(
                listProfiles
                    .map(profile => getProfileListKey(profile))
                    .filter(Boolean)
            );

            profiles.forEach((profile) => {
                const key = getProfileListKey(profile);
                if (key && seen.has(key)) return;
                listProfiles.push(profile);
                if (key) seen.add(key);
            });
        }

        function getProfileListKey(profile) {
            if (!profile) return '';
            if (profile.did) return profile.did;
            if (profile.handle) return profile.handle;
            return '';
        }

        function getFilteredListProfiles() {
            if (!listSearchEnabled || !listSearchQuery) return listProfiles;
            const matcher = createListSearchMatcher(listSearchQuery);
            if (matcher.invalidRegex && !listSearchLoadingAll) {
                listSearchHintOverride = 'Invalid regex. Use /pattern/flags, for example /tim/i. Falling back to plain text.';
            }
            if (!matcher.keyword && !matcher.regex) return listProfiles;
            return listProfiles.filter((profile) => doesProfileMatchSearch(profile, matcher));
        }

        function createListSearchMatcher(rawQuery) {
            const raw = (rawQuery || '').trim();
            if (!raw) {
                return { keyword: '', regex: null, invalidRegex: false };
            }

            const parsedRegex = parseListSearchRegex(raw);
            if (parsedRegex.regex) {
                return { keyword: '', regex: parsedRegex.regex, invalidRegex: false };
            }

            let keyword = raw.toLowerCase();
            if (keyword.startsWith('@')) {
                keyword = keyword.slice(1);
            }

            return {
                keyword,
                regex: null,
                invalidRegex: parsedRegex.invalid
            };
        }

        function parseListSearchRegex(raw) {
            if (!raw.startsWith('/') || raw.lastIndexOf('/') <= 0) {
                return { regex: null, invalid: false };
            }

            const lastSlash = raw.lastIndexOf('/');
            const pattern = raw.slice(1, lastSlash);
            const rawFlags = raw.slice(lastSlash + 1) || 'i';
            const flags = rawFlags.replace(/[gy]/g, '');

            try {
                return { regex: new RegExp(pattern, flags || 'i'), invalid: false };
            } catch (e) {
                return { regex: null, invalid: true };
            }
        }

        function doesProfileMatchSearch(profile, matcher) {
            if (!profile) return false;
            const displayName = profile.displayName || '';
            const handle = profile.handle || '';
            const handleLower = handle.toLowerCase();

            if (matcher.regex) {
                return matcher.regex.test(displayName) || matcher.regex.test(handle);
            }

            if (!matcher.keyword) return true;
            return displayName.toLowerCase().includes(matcher.keyword) || handleLower.includes(matcher.keyword);
        }

        function makeStaticPager(items, pageSize = 50) {
            return async (cursor) => {
                const offset = cursor ? parseInt(cursor, 10) : 0;
                const slice = items.slice(offset, offset + pageSize);
                const next = (offset + pageSize) < items.length ? String(offset + pageSize) : null;
                return { profiles: slice, cursor: next };
            };
        }

        async function bskyGetProfiles(actors) {
            if (!actors || actors.length === 0) return { profiles: [] };
            const chunks = [];
            for (let i = 0; i < actors.length; i += 25) {
                chunks.push(actors.slice(i, i + 25));
            }
            const out = [];
            for (const chunk of chunks) {
                const params = chunk.map(a => `actors=${encodeURIComponent(a)}`).join('&');
                const url = `${API_PUBLIC}/app.bsky.actor.getProfiles?${params}`;
                const res = await fetch(url);
                if (res.ok) {
                    const data = await res.json();
                    out.push(...(data.profiles || []));
                }
            }
            return { profiles: out };
        }

        async function bskyGetFollowersPage(cursor = null, limit = 50) {
            let url = `${API_PUBLIC}/app.bsky.graph.getFollowers?actor=${encodeURIComponent(currentDid)}&limit=${limit}`;
            if (cursor) url += `&cursor=${encodeURIComponent(cursor)}`;
            const res = await fetch(url);
            if (!res.ok) throw new Error('Failed to load followers');
            const data = await res.json();
            return { profiles: data.followers || [], cursor: data.cursor || null };
        }

        async function bskyGetFollowsPage(cursor = null, limit = 50) {
            let url = `${API_PUBLIC}/app.bsky.graph.getFollows?actor=${encodeURIComponent(currentDid)}&limit=${limit}`;
            if (cursor) url += `&cursor=${encodeURIComponent(cursor)}`;
            const res = await fetch(url);
            if (!res.ok) throw new Error('Failed to load following');
            const data = await res.json();
            return { profiles: data.follows || [], cursor: data.cursor || null };
        }

        async function pdsListRecords(collection, cursor = null, limit = 50) {
            let url = `${currentPdsUrl}/xrpc/com.atproto.repo.listRecords?repo=${encodeURIComponent(currentDid)}&collection=${encodeURIComponent(collection)}&limit=${limit}`;
            if (cursor) url += `&cursor=${encodeURIComponent(cursor)}`;
            const res = await fetch(url);
            if (!res.ok) throw new Error('Failed to list records from PDS');
            return await res.json();
        }

        async function getBlockingPage(cursor = null) {
            const data = await pdsListRecords('app.bsky.graph.block', cursor, 50);
            const dids = (data.records || [])
                .map(r => (r && r.value) ? (r.value.subject?.did || r.value.subject) : null)
                .filter(Boolean);

            const profilesRes = await bskyGetProfiles(dids);
            const profiles = profilesRes.profiles || [];

            return { profiles, cursor: data.cursor || null };
        }

        async function computeMutuals(maxFetch = 5000) {
            const followers = [];
            const follows = [];
            let followerCursor = null;
            let followCursor = null;

            while (followers.length < maxFetch) {
                const page = await bskyGetFollowersPage(followerCursor, Math.min(100, maxFetch - followers.length));
                followers.push(...(page.profiles || []));
                followerCursor = page.cursor;
                if (!followerCursor) break;
            }

            while (follows.length < maxFetch) {
                const page = await bskyGetFollowsPage(followCursor, Math.min(100, maxFetch - follows.length));
                follows.push(...(page.profiles || []));
                followCursor = page.cursor;
                if (!followCursor) break;
            }

            const followerSet = new Set(followers.map(p => p.did));
            const mutuals = follows.filter(p => followerSet.has(p.did));

            const truncated = Boolean(followerCursor || followCursor);
            return { mutuals, truncated };
        }

        async function computeBlockingCount(maxFetch = 5000) {
            let cursor = null;
            let count = 0;
            while (count < maxFetch) {
                const data = await pdsListRecords('app.bsky.graph.block', cursor, Math.min(100, maxFetch - count));
                const records = data.records || [];
                count += records.length;
                cursor = data.cursor || null;
                if (!cursor || records.length === 0) break;
            }
            const truncated = Boolean(cursor);
            return { count, truncated };
        }

        function openBlockedByInfo() {
            openListModal(
                'Blocked by',
                '',
                makeStaticPager([]),
                { searchable: false }
            );
            elements.listModalMeta.style.display = 'none';
            elements.listModalLoadMore.style.display = 'none';
            elements.listModalList.innerHTML = `
                <div class="empty-state" style="padding: 16px 10px;">
                    <p>Feature unavailable</p>
                    <p style="font-size: 13px; margin-top: 8px; color: var(--text-soft);">
                        This would require an external indexer service to determine which accounts have blocked this user.
                    </p>
                </div>
            `;
        }

        function wireProfileStatsButtons() {
            const likesEl = document.getElementById('likesStat');
            const followersEl = document.getElementById('followersStat');
            const followingEl = document.getElementById('followingStat');
            const mutualsEl = document.getElementById('mutualsStat');
            const blockingEl = document.getElementById('blockingStat');
            const blockedByEl = document.getElementById('blockedByStat');

            if (likesEl) {
                likesEl.onclick = async () => {
                    await updateLikesCount(true);
                };
            }
            if (followersEl) {
                followersEl.onclick = () => openListModal('Followers', '', (cursor) => bskyGetFollowersPage(cursor, 50));
            }
            if (followingEl) {
                followingEl.onclick = () => openListModal('Following', '', (cursor) => bskyGetFollowsPage(cursor, 50));
            }
            if (mutualsEl) {
                mutualsEl.onclick = async () => {
                    const cacheKey = currentDid || '';
                    if (cacheKey && mutualsCache.has(cacheKey)) {
                        const cached = mutualsCache.get(cacheKey);
                        const countEl = document.getElementById('mutualsCount');
                        if (countEl) countEl.textContent = formatNumber(cached.mutuals.length);
                        openListModal(
                            `Mutuals (${cached.mutuals.length}${cached.truncated ? '+' : ''})`,
                            cached.truncated ? 'Partial result (hit the 5000-per-list cap). Increase the cap in computeMutuals() if you need the full set.' : '',
                            makeStaticPager(cached.mutuals, 50)
                        );
                        return;
                    }
                    openListModal('Mutuals', 'Computing…', makeStaticPager([]));
                    elements.listModalLoadMore.style.display = 'none';
                    elements.listModalList.innerHTML = `
                        <div class="loading" style="padding: 24px 10px;">
                            <div class="spinner"></div>
                            <p>Computing mutuals…</p>
                        </div>
                    `;
                    try {
                        const { mutuals, truncated } = await computeMutuals(5000);
                        const countEl = document.getElementById('mutualsCount');
                        if (countEl) countEl.textContent = formatNumber(mutuals.length);
                        if (cacheKey) {
                            mutualsCache.set(cacheKey, { mutuals, truncated });
                        }
                        openListModal(
                            `Mutuals (${mutuals.length}${truncated ? '+' : ''})`,
                            truncated ? 'Partial result (hit the 5000-per-list cap). Increase the cap in computeMutuals() if you need the full set.' : '',
                            makeStaticPager(mutuals, 50)
                        );
                    } catch (e) {
                        closeListModal();
                        showError(e.message || String(e));
                    }
                };
            }
            if (blockingEl) {
                blockingEl.onclick = async () => {
                    openListModal('Blocking', 'Some blocked accounts may be deactivated and won’t appear.', (cursor) => getBlockingPage(cursor));
                };
            }
            if (blockedByEl) {
                blockedByEl.onclick = () => openBlockedByInfo();
            }
        }

        async function primeMutualsAndBlocking() {
            const cacheKey = currentDid || '';
            const mutualsCountEl = document.getElementById('mutualsCount');
            const blockingCountEl = document.getElementById('blockingCount');

            if (cacheKey) {
                if (mutualsCache.has(cacheKey)) {
                    const cached = mutualsCache.get(cacheKey);
                    if (mutualsCountEl) mutualsCountEl.textContent = formatNumber(cached.mutuals.length);
                }
                if (blockingCountCache.has(cacheKey)) {
                    const cached = blockingCountCache.get(cacheKey);
                    if (blockingCountEl) blockingCountEl.textContent = cached.truncated ? `${formatNumber(cached.count)}+` : formatNumber(cached.count);
                }
            }

            if (cacheKey && !mutualsCache.has(cacheKey)) {
                if (mutualsCountEl) mutualsCountEl.textContent = '…';
                try {
                    const { mutuals, truncated } = await computeMutuals(5000);
                    mutualsCache.set(cacheKey, { mutuals, truncated });
                    if (mutualsCountEl) mutualsCountEl.textContent = formatNumber(mutuals.length);
                } catch (e) {
                    if (mutualsCountEl) mutualsCountEl.textContent = '—';
                }
            }

            if (cacheKey && !blockingCountCache.has(cacheKey)) {
                if (blockingCountEl) blockingCountEl.textContent = '…';
                try {
                    const { count, truncated } = await computeBlockingCount(5000);
                    blockingCountCache.set(cacheKey, { count, truncated });
                    if (blockingCountEl) blockingCountEl.textContent = truncated ? `${formatNumber(count)}+` : formatNumber(count);
                } catch (e) {
                    if (blockingCountEl) blockingCountEl.textContent = '—';
                }
            }
        }

        let handleSuggestionTimer = null;
        let lastSuggestionQuery = '';
        let suggestionAbort = null;

        function queueHandleSuggestions(value) {
            if (handleSuggestionTimer) {
                clearTimeout(handleSuggestionTimer);
            }
            handleSuggestionTimer = setTimeout(() => {
                fetchHandleSuggestions(value);
            }, 250);
        }

        async function fetchHandleSuggestions(value) {
            const query = value.trim().replace('@', '');
            if (!query || query.length < 2) {
                closeHandleSuggestions();
                return;
            }
            if (query === lastSuggestionQuery) return;
            lastSuggestionQuery = query;

            if (suggestionAbort) suggestionAbort.abort();
            suggestionAbort = new AbortController();

            try {
                const url = `${API_PUBLIC}/app.bsky.actor.searchActorsTypeahead?term=${encodeURIComponent(query)}&limit=6`;
                const res = await fetch(url, { signal: suggestionAbort.signal });
                if (!res.ok) return;
                const data = await res.json();
                const actors = data.actors || [];
                renderHandleSuggestions(actors);
            } catch (e) {
                if (e.name === 'AbortError') return;
            }
        }

        function renderHandleSuggestions(actors) {
            if (!actors || actors.length === 0) {
                closeHandleSuggestions();
                return;
            }
            const html = actors.map(actor => {
                const avatar = actor.avatar || 'https://via.placeholder.com/40';
                const name = actor.displayName || actor.handle || actor.did || '';
                const handle = actor.handle ? '@' + actor.handle : (actor.did || '');
                const actorId = actor.handle || actor.did || '';
                return `
                    <div class="suggestion-item" data-actor="${escapeHtml(actorId)}">
                        <img class="suggestion-avatar" src="${escapeHtml(avatar)}" alt="">
                        <div class="suggestion-meta">
                            <div class="suggestion-name">${escapeHtml(name)}</div>
                            <div class="suggestion-handle">${escapeHtml(handle)}</div>
                        </div>
                    </div>
                `;
            }).join('');
            elements.handleSuggestions.innerHTML = html;
            elements.handleSuggestions.classList.add('open');
            [...elements.handleSuggestions.querySelectorAll('.suggestion-item')].forEach(el => {
                el.addEventListener('click', async () => {
                    const actor = el.getAttribute('data-actor');
                    if (!actor) return;
                    elements.handleInput.value = actor;
                    closeHandleSuggestions();
                    await loadContent('posts');
                });
            });
        }

        function closeHandleSuggestions() {
            elements.handleSuggestions.classList.remove('open');
            elements.handleSuggestions.innerHTML = '';
        }

        function updateUrlParams(handle, mode, list = '') {
            const params = new URLSearchParams();
            if (handle) params.set('handle', handle);
            if (mode) params.set('mode', mode);
            if (list) params.set('list', list);
            const query = params.toString();
            const newUrl = query ? `${window.location.pathname}?${query}` : window.location.pathname;
            window.history.replaceState({ handle, mode }, '', newUrl);
            if (handle && mode) {
                localStorage.setItem('lastHandle', handle);
                localStorage.setItem('lastMode', mode);
            }
        }

        function loadFromUrlParams() {
            const params = new URLSearchParams(window.location.search);
            const handle = params.get('handle');
            const mode = params.get('mode') === 'likes' ? 'likes' : 'posts';
            pendingListFromUrl = params.get('list') === 'blocking' ? 'blocking' : '';
            if (!handle) return;
            elements.handleInput.value = handle;
            loadContent(mode);
        }

        function loadFromStorage() {
            const handle = localStorage.getItem('lastHandle');
            const mode = localStorage.getItem('lastMode') === 'likes' ? 'likes' : 'posts';
            pendingListFromUrl = '';
            if (!handle) return;
            elements.handleInput.value = handle;
            loadContent(mode);
        }

        function maybeOpenPendingProfileList() {
            if (!pendingListFromUrl || !currentDid) return;
            const autoKey = `${currentDid}:${pendingListFromUrl}`;
            if (autoOpenedListKey === autoKey) return;

            if (pendingListFromUrl === 'blocking') {
                autoOpenedListKey = autoKey;
                openListModal('Blocking', 'Some blocked accounts may be deactivated and won’t appear.', (cursor) => getBlockingPage(cursor));
                pendingListFromUrl = '';
                updateUrlParams(currentHandle, currentMode);
            }
        }

        elements.listModalClose.addEventListener('click', closeListModal);
        elements.listModalLoadMore.addEventListener('click', loadMoreList);
        if (elements.listModalSearch) {
            elements.listModalSearch.addEventListener('input', () => {
                listSearchQuery = elements.listModalSearch.value.trim();
                if (!listSearchLoadingAll) {
                    listSearchHintOverride = '';
                }
                renderProfileListItems();
            });
            elements.listModalSearch.addEventListener('keydown', async (e) => {
                if (e.key !== 'Enter') return;
                if (!listSearchQuery || !listCursor) return;
                e.preventDefault();
                await loadAllListPagesForSearch();
            });
        }
        if (elements.listModalSearchAllBtn) {
            elements.listModalSearchAllBtn.addEventListener('click', async () => {
                if (!listSearchQuery || !listCursor) return;
                await loadAllListPagesForSearch();
            });
        }
        elements.listModal.addEventListener('click', (e) => {
            if (e.target === elements.listModal) closeListModal();
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                if (elements.listModal.classList.contains('open')) {
                    closeListModal();
                } else if (elements.infoModal.classList.contains('open')) {
                    elements.infoModal.classList.remove('open');
                    elements.infoModal.setAttribute('aria-hidden', 'true');
                }
            }
        });

        window.addEventListener('popstate', () => {
            loadFromUrlParams();
        });

        document.addEventListener('DOMContentLoaded', () => {
            initTheme();
            syncSeoUrlTags(getCanonicalHomeUrl());

            const params = new URLSearchParams(window.location.search);
            const handleFromUrl = params.get('handle');
            if (handleFromUrl) {
                loadFromUrlParams();
                return;
            }

            updateModeButtons('posts');
            if (window.location.search || window.location.hash) {
                const homeUrl = getToolHomeUrl();
                window.history.replaceState({}, '', homeUrl);
            }
        });

        async function updateAccountInfo(force = false) {
            const joinedEl = document.getElementById('joinedDate');
            const accountAgeEl = document.getElementById('accountAge');
            const lastActiveEl = document.getElementById('lastActiveDate');
            const identityUpdateEl = document.getElementById('identityUpdateDate');
            const lastFollowEl = document.getElementById('lastFollowDate');
            const recentPostsEl = document.getElementById('recentPosts30d');
            const recentLikesEl = document.getElementById('recentLikes30d');
            const recentFollowsEl = document.getElementById('recentFollows30d');
            const recentRepostsEl = document.getElementById('recentReposts30d');
            if (!joinedEl || !accountAgeEl || !lastActiveEl || !identityUpdateEl || !lastFollowEl || !recentPostsEl || !recentLikesEl || !recentFollowsEl || !recentRepostsEl) return;

            const token = ++accountInfoToken;

            if (!joinedDate && !joinedLoaded) {
                joinedDate = await fetchJoinedDate();
                joinedLoaded = Boolean(joinedDate);
            }
            if (token !== accountInfoToken) return;
            joinedEl.textContent = joinedDate ? formatEuDate(joinedDate) : '—';
            accountAgeEl.textContent = joinedDate ? formatAccountAge(joinedDate) : '—';

            const cachedRecentStats = !force && currentDid ? recentStatsCache.get(currentDid) : null;
            if (cachedRecentStats) {
                renderRecentStats(cachedRecentStats);
            } else if (currentDid && currentPdsUrl) {
                setRecentStatsLoading();
            } else {
                setRecentStatsUnavailable();
            }

            const shouldFetchLastActive = !(lastActiveLoaded && !force);
            const shouldFetchIdentityUpdate = !identityUpdateLoaded;
            const shouldFetchRecentStats = Boolean(currentDid && currentPdsUrl && (force || !cachedRecentStats));

            if (!shouldFetchLastActive) {
                lastActiveEl.textContent = (latestPostDate || latestLikeDate || latestFollowDate || latestRepostDate)
                    ? formatEuDate(getLatestActivityDate())
                    : '—';
                lastFollowEl.textContent = latestFollowDate ? formatEuDate(latestFollowDate) : '—';
            } else {
                lastActiveEl.textContent = '…';
                lastFollowEl.textContent = latestFollowDate ? formatEuDate(latestFollowDate) : '—';
            }

            if (!shouldFetchIdentityUpdate) {
                identityUpdateEl.textContent = formatIdentityUpdate(identityUpdatedDate, identityUpdateType);
                setIdentityUpdateTooltip(identityUpdateEl, identityUpdateType);
            } else {
                identityUpdateEl.textContent = (currentDid && currentPdsUrl) ? '…' : '—';
                identityUpdateEl.removeAttribute('title');
            }

            if (!currentDid || !currentPdsUrl || (!shouldFetchLastActive && !shouldFetchRecentStats && !shouldFetchIdentityUpdate)) return;

            const lastActivePromise = shouldFetchLastActive
                ? Promise.all([
                    fetchLatestPostDate(),
                    fetchLatestRecordDate('app.bsky.feed.like'),
                    fetchLatestRecordDate('app.bsky.graph.follow'),
                    fetchLatestRecordDate('app.bsky.feed.repost')
                ])
                : Promise.resolve(null);
            const recentStatsPromise = shouldFetchRecentStats
                ? fetchRecentActivityStats(30)
                : Promise.resolve(null);
            const identityUpdatePromise = shouldFetchIdentityUpdate
                ? fetchLatestIdentityUpdate()
                : Promise.resolve(null);

            const [lastActiveResult, recentStatsResult, identityUpdateResult] = await Promise.allSettled([lastActivePromise, recentStatsPromise, identityUpdatePromise]);

            if (token !== accountInfoToken) return;

            if (shouldFetchLastActive) {
                if (lastActiveResult.status === 'fulfilled' && lastActiveResult.value) {
                    const [postDate, likeDate, followDate, repostDate] = lastActiveResult.value;
                    latestPostDate = postDate || latestPostDate;
                    latestLikeDate = likeDate || latestLikeDate;
                    latestFollowDate = followDate || latestFollowDate;
                    latestRepostDate = repostDate || latestRepostDate;
                    const latestFinal = getLatestActivityDate();
                    lastActiveEl.textContent = latestFinal ? formatEuDate(latestFinal) : '—';
                    lastFollowEl.textContent = latestFollowDate ? formatEuDate(latestFollowDate) : '—';
                    lastActiveLoaded = true;
                } else {
                    lastActiveEl.textContent = latestPostDate ? formatEuDate(latestPostDate) : '—';
                    lastFollowEl.textContent = latestFollowDate ? formatEuDate(latestFollowDate) : '—';
                }
            }

            if (shouldFetchRecentStats) {
                if (recentStatsResult.status === 'fulfilled' && recentStatsResult.value) {
                    recentStatsCache.set(currentDid, recentStatsResult.value);
                    renderRecentStats(recentStatsResult.value);
                } else {
                    setRecentStatsUnavailable();
                }
            }

            if (shouldFetchIdentityUpdate) {
                if (identityUpdateResult.status === 'fulfilled') {
                    const identityUpdate = identityUpdateResult.value;
                    identityUpdatedDate = identityUpdate && identityUpdate.date ? identityUpdate.date : null;
                    identityUpdateType = identityUpdate && identityUpdate.type ? identityUpdate.type : '';
                    identityUpdateEl.textContent = formatIdentityUpdate(identityUpdatedDate, identityUpdateType);
                    setIdentityUpdateTooltip(identityUpdateEl, identityUpdateType);
                    identityUpdateLoaded = true;
                } else {
                    identityUpdateEl.textContent = formatIdentityUpdate(identityUpdatedDate, identityUpdateType);
                    setIdentityUpdateTooltip(identityUpdateEl, identityUpdateType);
                }
            }
        }

        function getLatestActivityDate() {
            let latest = latestPostDate || null;
            if (latestLikeDate && (!latest || latestLikeDate > latest)) latest = latestLikeDate;
            if (latestFollowDate && (!latest || latestFollowDate > latest)) latest = latestFollowDate;
            if (latestRepostDate && (!latest || latestRepostDate > latest)) latest = latestRepostDate;
            return latest;
        }

        function setRecentStatsLoading() {
            const ids = ['recentPosts30d', 'recentLikes30d', 'recentFollows30d', 'recentReposts30d'];
            ids.forEach((id) => {
                const el = document.getElementById(id);
                if (el) el.textContent = '…';
            });
        }

        function setRecentStatsUnavailable() {
            const ids = ['recentPosts30d', 'recentLikes30d', 'recentFollows30d', 'recentReposts30d'];
            ids.forEach((id) => {
                const el = document.getElementById(id);
                if (el) el.textContent = '—';
            });
        }

        function renderRecentStats(stats) {
            const mapping = {
                recentPosts30d: stats && stats.posts ? stats.posts : null,
                recentLikes30d: stats && stats.likes ? stats.likes : null,
                recentFollows30d: stats && stats.follows ? stats.follows : null,
                recentReposts30d: stats && stats.reposts ? stats.reposts : null
            };

            Object.keys(mapping).forEach((id) => {
                const el = document.getElementById(id);
                if (!el) return;
                el.textContent = formatRecentCount(mapping[id]);
            });
        }

        function formatRecentCount(metric) {
            if (!metric || typeof metric.count !== 'number') return '—';
            if (metric.truncated && metric.count === 0) return '—';
            return metric.truncated ? `${formatNumber(metric.count)}+` : formatNumber(metric.count);
        }

        function formatAccountAge(date) {
            if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '—';
            const now = new Date();

            let years = now.getFullYear() - date.getFullYear();
            let months = now.getMonth() - date.getMonth();
            if (now.getDate() < date.getDate()) {
                months -= 1;
            }
            if (months < 0) {
                years -= 1;
                months += 12;
            }

            if (years > 0) return `${years}y ${months}m`;
            if (months > 0) return `${months}m`;

            const diffMs = now.getTime() - date.getTime();
            const days = Math.max(0, Math.floor(diffMs / (24 * 60 * 60 * 1000)));
            return `${days}d`;
        }

        function formatIdentityUpdate(date, type) {
            if (!date) return '—';
            return formatEuDate(date);
        }

        function setIdentityUpdateTooltip(element, type) {
            if (!element) return;
            if (type) {
                element.setAttribute('title', `Reason: ${type}`);
            } else {
                element.removeAttribute('title');
            }
        }

        async function fetchLatestIdentityUpdate() {
            if (!currentDid || !currentPdsUrl) return null;
            try {
                const [plcIdentityUpdate, profileRecordDate] = await Promise.all([
                    fetchLatestPlcIdentityUpdate(),
                    fetchLatestRecordDate('app.bsky.actor.profile')
                ]);

                const profileUpdatedAt = parseDateValue(currentProfile && currentProfile.updatedAt);
                const profileIndexedAt = parseDateValue(currentProfile && currentProfile.indexedAt);
                const profileRecordUpdate = profileRecordDate
                    ? { date: profileRecordDate, type: 'profile change' }
                    : null;
                const profileAppUpdate = profileUpdatedAt
                    ? { date: profileUpdatedAt, type: 'profile change' }
                    : (profileIndexedAt ? { date: profileIndexedAt, type: 'profile change (indexed)' } : null);
                const profileIdentityUpdate = pickLatestIdentityUpdate(profileRecordUpdate, profileAppUpdate);

                return pickLatestIdentityUpdate(plcIdentityUpdate, profileIdentityUpdate);
            } catch (e) {
                return null;
            }
        }

        async function fetchLatestPlcIdentityUpdate() {
            if (!currentDid || !currentDid.startsWith('did:plc:')) return null;
            const auditLog = await fetchPlcAuditLog(currentDid);
            if (!Array.isArray(auditLog) || auditLog.length === 0) return null;

            const entries = auditLog
                .filter(entry => entry && entry.nullified !== true)
                .filter(entry => parseDateValue(entry.createdAt))
                .sort((a, b) => {
                    const aTs = parseDateValue(a.createdAt).getTime();
                    const bTs = parseDateValue(b.createdAt).getTime();
                    return aTs - bTs;
                });

            if (entries.length === 0) return null;

            const latestEntry = entries[entries.length - 1];
            const previousEntry = entries.length > 1 ? entries[entries.length - 2] : null;

            return {
                date: parseDateValue(latestEntry.createdAt),
                type: classifyIdentityUpdateType(
                    previousEntry ? previousEntry.operation : null,
                    latestEntry.operation
                )
            };
        }

        function pickLatestIdentityUpdate(primaryEvent, secondaryEvent) {
            const primaryDate = primaryEvent && primaryEvent.date ? primaryEvent.date : null;
            const secondaryDate = secondaryEvent && secondaryEvent.date ? secondaryEvent.date : null;
            if (!primaryDate && !secondaryDate) return null;
            if (primaryDate && !secondaryDate) return primaryEvent;
            if (!primaryDate && secondaryDate) return secondaryEvent;

            const primaryTs = primaryDate.getTime();
            const secondaryTs = secondaryDate.getTime();
            if (primaryTs > secondaryTs) return primaryEvent;
            if (secondaryTs > primaryTs) return secondaryEvent;

            const mergedType = [primaryEvent.type, secondaryEvent.type]
                .filter(Boolean)
                .filter((value, index, arr) => arr.indexOf(value) === index)
                .join(', ');
            return { date: primaryDate, type: mergedType || 'identity update' };
        }

        function classifyIdentityUpdateType(previousOperation, currentOperation) {
            if (!currentOperation) return 'identity update';
            if (!previousOperation) return 'account created';

            const types = [];
            const previousHandle = getOperationHandle(previousOperation);
            const currentHandle = getOperationHandle(currentOperation);
            const previousPds = getOperationPds(previousOperation);
            const currentPds = getOperationPds(currentOperation);
            const previousAtprotoKey = getOperationAtprotoKey(previousOperation);
            const currentAtprotoKey = getOperationAtprotoKey(currentOperation);
            const previousRotationKeys = getOperationRotationKeys(previousOperation);
            const currentRotationKeys = getOperationRotationKeys(currentOperation);

            if (previousHandle !== currentHandle) types.push('handle change');
            if (previousPds !== currentPds) types.push('PDS change');
            if (previousAtprotoKey !== currentAtprotoKey) types.push('signing key change');
            if (!areSameStringArrays(previousRotationKeys, currentRotationKeys)) types.push('rotation key change');

            return types.length ? types.join(', ') : 'identity update';
        }

        function getOperationHandle(operation) {
            const alsoKnownAs = Array.isArray(operation && operation.alsoKnownAs) ? operation.alsoKnownAs : [];
            const atUri = alsoKnownAs.find(value => typeof value === 'string' && value.startsWith('at://'));
            return atUri ? atUri.slice(5) : '';
        }

        function getOperationPds(operation) {
            const services = operation && operation.services ? operation.services : {};
            const pds = services.atproto_pds;
            return pds && typeof pds.endpoint === 'string' ? pds.endpoint : '';
        }

        function getOperationAtprotoKey(operation) {
            const methods = operation && operation.verificationMethods ? operation.verificationMethods : {};
            return methods && typeof methods.atproto === 'string' ? methods.atproto : '';
        }

        function getOperationRotationKeys(operation) {
            const keys = Array.isArray(operation && operation.rotationKeys) ? operation.rotationKeys.slice() : [];
            return keys.sort();
        }

        function areSameStringArrays(a, b) {
            if (!Array.isArray(a) || !Array.isArray(b)) return false;
            if (a.length !== b.length) return false;
            for (let i = 0; i < a.length; i += 1) {
                if (a[i] !== b[i]) return false;
            }
            return true;
        }

        async function fetchPlcAuditLog(did) {
            try {
                const direct = await fetch(`https://plc.directory/${did}/log/audit`);
                if (direct.ok) {
                    return await direct.json();
                }
            } catch (e) {
                // continue to proxy fallback
            }

            try {
                const proxy = await fetch(`https://r.jina.ai/http://plc.directory/${did}/log/audit`);
                if (!proxy.ok) return null;
                const text = await proxy.text();
                return extractJsonArray(text);
            } catch (e) {
                return null;
            }
        }

        async function fetchJoinedDate() {
            if (!currentDid) return null;
            try {
                if (currentProfile && currentProfile.createdAt) {
                    return new Date(currentProfile.createdAt);
                }
                if (currentDid.startsWith('did:plc:')) {
                    const direct = await fetchPlcData(`https://plc.directory/${currentDid}/data`);
                    if (direct && direct.createdAt) return new Date(direct.createdAt);

                    // Fallback through a text proxy to avoid CORS blocks.
                    const proxy = await fetchPlcData(`https://r.jina.ai/http://plc.directory/${currentDid}/data`, true);
                    if (proxy && proxy.createdAt) return new Date(proxy.createdAt);
                }
                if (currentDidDoc && currentDidDoc.createdAt) {
                    return new Date(currentDidDoc.createdAt);
                }
            } catch (e) {
                return null;
            }
            return null;
        }

        async function fetchPlcData(url, textMode = false) {
            try {
                const res = await fetch(url);
                if (!res.ok) return null;
                if (!textMode) {
                    return await res.json();
                }
                const text = await res.text();
                return extractJsonObject(text);
            } catch (e) {
                return null;
            }
        }

        function extractJsonObject(text) {
            if (!text) return null;
            const first = text.indexOf('{');
            const last = text.lastIndexOf('}');
            if (first === -1 || last === -1 || last <= first) return null;
            try {
                return JSON.parse(text.slice(first, last + 1));
            } catch (e) {
                return null;
            }
        }

        function extractJsonArray(text) {
            if (!text) return null;
            const first = text.indexOf('[');
            const last = text.lastIndexOf(']');
            if (first === -1 || last === -1 || last <= first) return null;
            try {
                return JSON.parse(text.slice(first, last + 1));
            } catch (e) {
                return null;
            }
        }

        async function loadAllPosts() {
            if (!currentDid) {
                showError('Please load content first before using this feature');
                return;
            }

            if (allPostsLoaded) {
                showError('All content is already loaded');
                return;
            }

            const contentType = currentMode === 'posts' ? 'posts' : 'likes';
            const confirmed = confirm(`This will load all ${contentType} from this account. For accounts with many ${contentType}, this may take several minutes. Continue?`);
            if (!confirmed) return;

            setLoading(true);
            const statusDiv = document.createElement('div');
            statusDiv.className = 'warning-text show';
            statusDiv.style.marginBottom = '16px';
            statusDiv.textContent = `Loading all ${contentType}...`;
            elements.content.insertBefore(statusDiv, elements.content.firstChild);

            try {
                if (currentMode === 'posts') {
                    await loadAllPostsContent(statusDiv);
                } else {
                    await loadAllLikesContent(statusDiv);
                }

                allPostsLoaded = true;
                currentCursor = null;
                setLoadMoreVisible(false);
                updateLikesCount();
                
                statusDiv.className = 'success-message';
                statusDiv.textContent = `Successfully loaded all ${allPosts.length} ${contentType}`;
                if (pendingSortOldest || elements.sortOldest.checked) {
                    applyFiltersImmediate();
                    pendingSortOldest = false;
                }
                
                setTimeout(() => {
                    statusDiv.remove();
                }, 5000);

            } catch (error) {
                showError(`Failed to load all ${contentType}: ` + error.message);
                statusDiv.remove();
            } finally {
                setLoading(false);
            }
        }

        async function loadAllPostsContent(statusDiv) {
            const hideReplies = elements.hideReplies.checked;
            let filter = hideReplies ? 'posts_no_replies' : 'posts_with_replies';
            let cursor = currentCursor;
            let batchCount = 0;

            while (cursor) {
                batchCount++;
                let url = `${API_PUBLIC}/app.bsky.feed.getAuthorFeed?actor=${encodeURIComponent(currentDid)}&filter=${filter}&limit=100`;
                url += `&cursor=${encodeURIComponent(cursor)}`;

                const response = await fetch(url);
                if (!response.ok) {
                    throw new Error(`Failed to load posts batch ${batchCount} (HTTP ${response.status})`);
                }

                const data = await response.json();
                
                allPosts.push(...data.feed);
                
                displayPosts(data.feed, true);
                
                cursor = data.cursor || null;
                
                statusDiv.textContent = `Loading... ${allPosts.length} posts loaded (batch ${batchCount})`;
                
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }

        async function loadAllLikesContent(statusDiv) {
            let cursor = currentCursor;
            let batchCount = 0;
            let allLikeRecords = [];

            while (cursor) {
                batchCount++;
                let url = `${currentPdsUrl}/xrpc/com.atproto.repo.listRecords?repo=${encodeURIComponent(currentDid)}&collection=app.bsky.feed.like&limit=100`;
                url += `&cursor=${encodeURIComponent(cursor)}`;

                const response = await fetch(url);
                if (!response.ok) {
                    throw new Error(`Failed to load likes batch ${batchCount} (HTTP ${response.status})`);
                }

                const data = await response.json();
                
                if (!data.records || data.records.length === 0) break;

                allLikeRecords.push(...data.records);
                
                const postUris = data.records.map(record => record.value.subject.uri);
                const posts = await fetchPosts(postUris);

                const replyParentUris = posts
                    .map(post => post?.record?.reply?.parent?.uri)
                    .filter(Boolean);
                const uniqueParentUris = [...new Set(replyParentUris)];
                let parentPostsMap = new Map();
                if (uniqueParentUris.length > 0) {
                    const parentPosts = await fetchPosts(uniqueParentUris);
                    parentPostsMap = new Map(parentPosts.map(p => [p.uri, p]));
                }

                posts.forEach(post => {
                    const parentUri = post?.record?.reply?.parent?.uri;
                    if (parentUri && parentPostsMap.has(parentUri)) {
                        post.reply = { parent: parentPostsMap.get(parentUri) };
                    }
                });
                
                // Store posts with metadata for filtering
                const postsWithMeta = posts.map(post => ({
                    post: post,
                    reason: null,
                    reply: post.reply || null,
                    likeTimestamp: data.records.find(r => r.value.subject.uri === post.uri)?.value.createdAt
                }));
                
                allPosts.push(...postsWithMeta);
                
                displayLikePosts(posts, data.records, true);
                
                cursor = data.cursor || null;
                
                statusDiv.textContent = `Loading... ${allLikeRecords.length} likes loaded (batch ${batchCount})`;
                
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }

        let likesCountToken = 0;
        let likesCountTruncated = false;
        let likesCountExact = false;
        let likesCountBusy = false;

        async function updateLikesCount(forceExact = false) {
            const likesEl = document.getElementById('likesCount');
            if (!likesEl) return;
            const likesStat = document.getElementById('likesStat');
            if (!currentDid || !currentPdsUrl) {
                likesEl.textContent = '—';
                if (likesStat) likesStat.removeAttribute('title');
                return;
            }

            let token = 0;
            try {
                const cacheKey = currentDid;
                if (!forceExact && likesCountCache.has(cacheKey)) {
                    const cached = likesCountCache.get(cacheKey);
                    likesCountTruncated = cached.truncated;
                    likesCountExact = cached.exact;
                    likesEl.textContent = cached.text;
                    if (likesStat) {
                        if (cached.truncated && !forceExact) {
                            likesStat.setAttribute('title', cached.title || 'Click to compute exact likes');
                        } else {
                            likesStat.removeAttribute('title');
                        }
                    }
                    likesCountBusy = false;
                    return;
                }

                if (likesCountBusy) return;
                if (likesCountExact && !forceExact) return;

                token = ++likesCountToken;
                likesCountBusy = true;
                likesEl.textContent = '…';
                if (likesStat) likesStat.removeAttribute('title');

                const maxFetch = forceExact ? Number.MAX_SAFE_INTEGER : 2000;
                const pageSize = 100;
                let cursor = null;
                let count = 0;
                let truncated = false;

                while (count < maxFetch) {
                    let url = `${currentPdsUrl}/xrpc/com.atproto.repo.listRecords?repo=${encodeURIComponent(currentDid)}&collection=app.bsky.feed.like&limit=${pageSize}`;
                    if (cursor) url += `&cursor=${encodeURIComponent(cursor)}`;
                    const res = await fetch(url);
                    if (!res.ok) throw new Error('Failed to load likes count');
                    const data = await res.json();
                    const batch = (data.records || []).length;
                    count += batch;
                    cursor = data.cursor || null;
                    if (!cursor || batch === 0) break;
                }

                if (cursor) {
                    truncated = true;
                }

                if (token !== likesCountToken) return;
                likesCountTruncated = truncated;
                likesCountExact = !truncated;
                likesEl.textContent = truncated ? `${formatNumber(count)}+` : formatNumber(count);
                if (likesStat) {
                    if (truncated && !forceExact) {
                        likesStat.setAttribute('title', `Showing ${formatNumber(count)}+ (click to compute exact)`);
                    } else if (forceExact) {
                        likesStat.setAttribute('title', `Exact likes count`);
                    } else {
                        likesStat.removeAttribute('title');
                    }
                }
                if (!forceExact) {
                    likesCountCache.set(cacheKey, {
                        text: likesEl.textContent,
                        truncated: likesCountTruncated,
                        exact: likesCountExact,
                        title: likesStat ? likesStat.getAttribute('title') : ''
                    });
                }
            } catch (e) {
                if (token !== likesCountToken) return;
                likesEl.textContent = '—';
            } finally {
                if (token === likesCountToken) likesCountBusy = false;
            }
        }

        function applyCachedLikesCount() {
            const likesEl = document.getElementById('likesCount');
            const likesStat = document.getElementById('likesStat');
            if (!likesEl || !currentDid) return;
            if (!likesCountCache.has(currentDid)) return;
            const cached = likesCountCache.get(currentDid);
            likesCountTruncated = cached.truncated;
            likesCountExact = cached.exact;
            likesEl.textContent = cached.text;
            if (likesStat) {
                if (cached.truncated) {
                    likesStat.setAttribute('title', cached.title || 'Click to compute exact likes');
                } else {
                    likesStat.removeAttribute('title');
                }
            }
        }

        function hasExpensiveFilters() {
            return Boolean(
                elements.sortOldest.checked ||
                elements.onlyLinks.checked ||
                elements.dateFrom.value ||
                elements.dateTo.value ||
                elements.searchText.value.trim() ||
                elements.searchAuthor.value.trim()
            );
        }

        function clearExpensiveFilters() {
            elements.sortOldest.checked = false;
            elements.onlyLinks.checked = false;
            elements.dateFrom.value = '';
            elements.dateTo.value = '';
            elements.searchText.value = '';
            elements.searchAuthor.value = '';
            toggleClearButton(elements.searchText);
            toggleClearButton(elements.searchAuthor);
        }

        async function handleFilterChange() {
            if (!currentDid) return;
            if (hasExpensiveFilters()) {
                const dateRangeTarget = getAnalyticsTargetStartDate('custom');
                if (dateRangeTarget) {
                    await ensureLoadedThroughDate(dateRangeTarget);
                }

                const needsMoreForActiveFilters = dateRangeTarget
                    ? !isLoadedThroughDate(dateRangeTarget)
                    : !allPostsLoaded;
                if (needsMoreForActiveFilters && currentCursor) {
                    setAdvancedFiltersExpanded(true);
                    elements.filterBanner.classList.add('show');
                } else {
                    elements.filterBanner.classList.remove('show');
                }
                applyFiltersImmediate();
            } else {
                elements.filterBanner.classList.remove('show');
                await resetToPagedView();
            }
        }

        async function resetToPagedView() {
            if (!currentDid) return;
            currentCursor = null;
            allPosts = [];
            allPostsLoaded = false;
            setLoading(true);
            showLoading();
            try {
                if (currentMode === 'posts') {
                    await loadPosts(false);
                } else {
                    await loadLikes(false);
                }
            } finally {
                setLoading(false);
            }
        }

        function rerenderCurrentView() {
            if (!currentDid) return;

            if (hasExpensiveFilters()) {
                if (!allPostsLoaded) {
                    setAdvancedFiltersExpanded(true);
                    elements.filterBanner.classList.add('show');
                } else {
                    elements.filterBanner.classList.remove('show');
                }
                applyFiltersImmediate();
                return;
            }

            elements.filterBanner.classList.remove('show');

            if (currentMode === 'posts') {
                displayPosts(allPosts, false);
            } else {
                const posts = allPosts.map(item => item.post);
                const likeRecords = allPosts.map(item => ({
                    value: {
                        subject: { uri: item.post.uri },
                        createdAt: item.likeTimestamp
                    }
                }));
                displayLikePosts(posts, likeRecords, false);
            }

            setLoadMoreVisible(Boolean(currentCursor));
        }

        function applyFiltersImmediate() {
            const hasDateFilter = elements.dateFrom.value || elements.dateTo.value;
            const hasTextFilter = elements.searchText.value.trim();
            const hasAuthorFilter = elements.searchAuthor.value.trim();
            
            let filtered = [...allPosts];
            
            if (hasDateFilter) {
                const dateFrom = elements.dateFrom.value ? new Date(elements.dateFrom.value + 'T00:00:00') : null;
                const dateTo = elements.dateTo.value ? new Date(elements.dateTo.value + 'T23:59:59') : null;

                filtered = filtered.filter(item => {
                    const post = item.post;
                    let postDate;
                    
                    if (currentMode === 'likes' && item.likeTimestamp) {
                        // For likes, use the like timestamp
                        postDate = new Date(item.likeTimestamp);
                    } else {
                        // For posts, use the creation date
                        postDate = new Date(post.record.createdAt);
                    }
                    
                    if (dateFrom && postDate < dateFrom) return false;
                    if (dateTo && postDate > dateTo) return false;
                    return true;
                });
            }

            if (hasTextFilter) {
                const raw = hasTextFilter.trim();
                const regex = parseSearchRegex(raw, 'Invalid regex pattern. Falling back to keyword search.');

                if (regex) {
                    filtered = filtered.filter(item => {
                        const post = item.post;
                        const text = (post.record.text || '');
                        return regex.test(text);
                    }).map(item => ({
                        ...item,
                        _highlight: { regex }
                    }));
                } else {
                    const keywords = raw.toLowerCase().split(/\s+/).filter(Boolean);
                    filtered = filtered.filter(item => {
                        const post = item.post;
                        const text = (post.record.text || '').toLowerCase();
                        return keywords.every(word => text.includes(word));
                    }).map(item => ({
                        ...item,
                        _highlight: { keywords }
                    }));
                }
            }

            if (hasAuthorFilter) {
                const raw = elements.searchAuthor.value.trim();
                const regex = parseSearchRegex(raw, 'Invalid regex pattern in author search. Falling back to keyword search.');

                if (regex) {
                    filtered = filtered.filter(item => authorMatches(item, (value) => regex.test(value)));
                } else {
                    const keywords = raw.toLowerCase().split(/\s+/).filter(Boolean);
                    filtered = filtered.filter(item => authorMatches(item, (value) => keywords.every(word => value.includes(word))));
                }
            }

            if (elements.onlyLinks.checked) {
                filtered = filtered.filter(item => {
                    const isRepost = Boolean(item.reason && item.reason.$type === 'app.bsky.feed.defs#reasonRepost');
                    const isLikeView = currentMode === 'likes';
                    if (isRepost) return false;
                    if (isLikeView) return postHasLink(item.post);
                    return postHasLink(item.post);
                });
            }

            elements.content.innerHTML = '';
            if (filtered.length === 0) {
                const contentType = currentMode === 'posts' ? 'posts' : 'likes';
                elements.content.innerHTML = `
                    <div class="empty-state">
                        <p>No ${contentType} match your filters</p>
                        <p style="font-size: 13px; margin-top: 8px; color: var(--text-soft);">
                            ${hasDateFilter ? 'Date range: ' + (elements.dateFrom.value || 'any') + ' to ' + (elements.dateTo.value || 'any') : ''}
                            ${hasTextFilter ? (hasDateFilter ? '<br>' : '') + 'Search: "' + escapeHtml(hasTextFilter) + '"' : ''}
                            ${hasAuthorFilter ? ((hasDateFilter || hasTextFilter) ? '<br>' : '') + 'Author: "' + escapeHtml(hasAuthorFilter) + '"' : ''}
                        </p>
                    </div>
                `;
                clearVisualizations();
            } else {
                if (currentMode === 'posts') {
                    displayPosts(filtered, false);
                } else {
                    // For likes, we need to extract just the posts
                    const posts = filtered.map(item => item.post);
                    const likeRecords = filtered.map(item => ({
                        value: {
                            subject: { uri: item.post.uri },
                            createdAt: item.likeTimestamp
                        }
                    }));
                    displayLikePosts(posts, likeRecords, false, filtered.map(item => item._highlight || null));
                }
                
                const infoDiv = document.createElement('div');
                infoDiv.className = 'success-message';
                if (currentMode === 'likes') {
                    const totalLikes = likesCountCache.has(currentDid) ? likesCountCache.get(currentDid).text : null;
                    infoDiv.textContent = `Showing ${filtered.length} of ${allPosts.length} likes${totalLikes ? ` (total ${totalLikes})` : ''}. Some likes may be unavailable.`;
                } else {
                    infoDiv.textContent = `Showing ${filtered.length} of ${allPosts.length} loaded items`;
                }
                elements.content.insertBefore(infoDiv, elements.content.firstChild);
            }
        }

        function updateModeButtons(mode) {
            elements.loadPostsBtn.classList.toggle('active', mode === 'posts');
            elements.loadLikesBtn.classList.toggle('active', mode === 'likes');
        }

        async function loadContent(mode) {
            const handle = elements.handleInput.value.trim();
            
            if (!handle) {
                showError('Please enter a Bluesky handle or DID', true);
                return;
            }

            closeHandleSuggestions();
            updateModeButtons(mode);
            setLoading(true);
            elements.error.innerHTML = '';
            showLoading();
            analyticsExpanded = false;
            analyticsRangePreset = ANALYTICS_RANGE_DEFAULT;
            setAnalyticsToggleVisible(false);
            setAnalyticsExpanded(false);
            
            try {
                const prevDid = currentDid;
                const prevPds = currentPdsUrl;
                const resolvedDid = await resolveHandle(handle);
                const resolvedPds = await getPdsUrl(resolvedDid);

                const sameAccount = prevDid && prevDid === resolvedDid && prevPds === resolvedPds;

                currentDid = resolvedDid;
                currentPdsUrl = resolvedPds;
                currentHandle = handle;
                currentMode = mode;
                currentCursor = null;
                allPosts = [];
                allPostsLoaded = false;
                if (!sameAccount) {
                    latestPostDate = null;
                    latestLikeDate = null;
                    joinedDate = null;
                    identityUpdatedDate = null;
                    identityUpdateType = '';
                    latestFollowDate = null;
                    latestRepostDate = null;
                    joinedLoaded = false;
                    lastActiveLoaded = false;
                    identityUpdateLoaded = false;
                    likesCountCache.clear();
                    mutualsCache.clear();
                    blockingCountCache.clear();
                    recentStatsCache.clear();
                    likesCountToken = 0;
                    likesCountTruncated = false;
                    likesCountExact = false;
                    likesCountBusy = false;
                }

                if (!sameAccount) {
                    await loadProfile(currentDid);
                    updateAccountInfo(true);
                } else {
                    updateAccountInfo(false);
                }
                updateUrlParams(currentHandle, currentMode, pendingListFromUrl);

                if (mode === 'posts') {
                    elements.sectionTitle.textContent = 'Posts';
                    await loadPosts();
                    updateLikesCount();
                } else {
                    elements.sectionTitle.textContent = 'Likes';
                    await loadLikes();
                    updateLikesCount();
                }

                elements.contentSection.style.display = 'block';
                updateCoverageHint();
                if (hasExpensiveFilters()) {
                    handleFilterChange();
                }
                maybeOpenPendingProfileList();
            } catch (error) {
                showError(error.message, true);
                elements.profileCard.style.display = 'none';
                elements.contentSection.style.display = 'none';
                updateCoverageHint();
            } finally {
                setLoading(false);
            }
        }

        async function loadPosts(append = false) {
            try {
                const hideReplies = elements.hideReplies.checked;
                let filter = hideReplies ? 'posts_no_replies' : 'posts_with_replies';
                
                let url = `${API_PUBLIC}/app.bsky.feed.getAuthorFeed?actor=${encodeURIComponent(currentDid)}&filter=${filter}&limit=50`;
                
                if (currentCursor) {
                    url += `&cursor=${encodeURIComponent(currentCursor)}`;
                }

                const response = await fetch(url);
                
                if (!response.ok) {
                    throw new Error('Failed to load posts');
                }
                
                const data = await response.json();
                if (data.feed && data.feed[0] && data.feed[0].post && data.feed[0].post.record && data.feed[0].post.record.createdAt) {
                    latestPostDate = new Date(data.feed[0].post.record.createdAt);
                    updateAccountInfo();
                }
                
                if (!append) {
                    allPosts = [...data.feed];
                } else {
                    allPosts.push(...data.feed);
                }

                if (elements.sortOldest.checked) {
                    displayPosts(allPosts, false);
                } else {
                    displayPosts(data.feed, append);
                }

                currentCursor = data.cursor || null;
                allPostsLoaded = !currentCursor;
                setLoadMoreVisible(Boolean(currentCursor));
            } catch (error) {
                showError(error.message);
            }
        }

        async function loadLikes(append = false) {
            try {
                let url = `${currentPdsUrl}/xrpc/com.atproto.repo.listRecords?repo=${encodeURIComponent(currentDid)}&collection=app.bsky.feed.like&limit=50`;
                
                if (currentCursor) {
                    url += `&cursor=${encodeURIComponent(currentCursor)}`;
                }

                const response = await fetch(url);
                
                if (!response.ok) {
                    throw new Error('Failed to load likes from PDS');
                }
                
                const data = await response.json();
                
                if (!data.records || data.records.length === 0) {
                    if (!append) {
                        elements.content.innerHTML = `
                            <div class="empty-state">
                                <p>No likes found</p>
                            </div>
                        `;
                    }
                    allPostsLoaded = true;
                    currentCursor = null;
                    setLoadMoreVisible(false);
                    return;
                }

                const postUris = data.records.map(record => record.value.subject.uri);
                
                const posts = await fetchPosts(postUris);

                const postsWithMeta = posts.map(post => ({
                    post: post,
                    reason: null,
                    reply: null,
                    likeTimestamp: data.records.find(r => r.value.subject.uri === post.uri)?.value.createdAt
                }));

                if (!append) {
                    allPosts = [...postsWithMeta];
                } else {
                    allPosts.push(...postsWithMeta);
                }

                if (elements.sortOldest.checked) {
                    const postsAll = allPosts.map(item => item.post);
                    const likeRecordsAll = allPosts.map(item => ({
                        value: {
                            subject: { uri: item.post.uri },
                            createdAt: item.likeTimestamp
                        }
                    }));
                    displayLikePosts(postsAll, likeRecordsAll, false);
                } else {
                    displayLikePosts(posts, data.records, append);
                }
                updateLikesCount();
                
                currentCursor = data.cursor || null;
                allPostsLoaded = !currentCursor;
                setLoadMoreVisible(Boolean(currentCursor));
            } catch (error) {
                showError(error.message);
                if (!append) {
                    elements.content.innerHTML = `
                        <div class="empty-state">
                            <p>Failed to load likes</p>
                            <p style="font-size: 13px; margin-top: 8px; color: var(--text-soft);">${escapeHtml(error.message)}</p>
                        </div>
                    `;
                }
            }
        }

        async function fetchPosts(uris) {
            if (uris.length === 0) return [];
            
            try {
                const chunks = [];
                for (let i = 0; i < uris.length; i += 25) {
                    chunks.push(uris.slice(i, i + 25));
                }
                
                const allPosts = [];
                for (const chunk of chunks) {
                    const urisParam = chunk.map(uri => `uris=${encodeURIComponent(uri)}`).join('&');
                    const url = `${API_PUBLIC}/app.bsky.feed.getPosts?${urisParam}`;
                    
                    const response = await fetch(url);
                    if (!response.ok) {
                        throw new Error(`Failed to load post details (HTTP ${response.status})`);
                    }
                    const data = await response.json();
                    allPosts.push(...(data.posts || []));
                }
                
                return allPosts;
            } catch (error) {
                throw new Error(`Error fetching posts: ${error.message}`);
            }
        }

        function clearVisualizations() {
            if (!elements.visualizations) return;
            if (visualizationTransitionTimer) {
                clearTimeout(visualizationTransitionTimer);
                visualizationTransitionTimer = null;
            }
            elements.visualizations.innerHTML = '';
            elements.visualizations.style.display = 'none';
            elements.visualizations.classList.remove('has-data', 'is-open', 'is-range-updating');
            setAnalyticsToggleVisible(false);
            setAnalyticsExpanded(false);
        }

        function renderVisualizations(rows, mode) {
            if (!elements.visualizations) return;
            if (!Array.isArray(rows) || rows.length === 0) {
                clearVisualizations();
                return;
            }

            const hasDateRangeFilter = Boolean(elements.dateFrom.value || elements.dateTo.value);
            const activeRangeKey = hasDateRangeFilter ? 'custom' : analyticsRangePreset;
            const activeRange = getAnalyticsRangeDefinition(activeRangeKey);
            const snapshot = buildVisualizationSnapshot(rows, mode, activeRangeKey);
            if (!snapshot) {
                clearVisualizations();
                return;
            }

            const activityLabel = mode === 'likes' ? 'likes' : 'posts';
            const timelineTitle = `${formatEuDate(snapshot.timeline.start)} - ${formatEuDate(snapshot.timeline.end)}`;
            const timelineScopeBase = hasDateRangeFilter
                ? 'Date filters apply to both the chart and the list below.'
                : `Showing ${activeRange.scopeLabel}${snapshot.timeline.isComplete ? '.' : ' (older results may still be unloaded).'}`;
            const timelineGroupingNote = snapshot.timeline.bucketMode === 'week'
                ? ' Grouped by week for readability.'
                : (snapshot.timeline.bucketMode === 'month' ? ' Grouped by month for readability.' : '');
            const timelineScopeNote = `${timelineScopeBase}${timelineGroupingNote}`;
            const analyticsOnlyNote = hasDateRangeFilter
                ? ''
                : '<p class="viz-activity-note">Week, Month and Year buttons change only the chart. To filter the list, use date filters above.</p>';
            const timelineSeriesDefs = (mode === 'likes' && likesTimelineMainOnly)
                ? snapshot.timeline.seriesDefs.filter((series) => series.key === 'allLikes')
                : snapshot.timeline.seriesDefs;
            const activeTimelineSeriesDefs = timelineSeriesDefs.length > 0 ? timelineSeriesDefs : snapshot.timeline.seriesDefs;
            const timelineSvg = buildTimelineSvg(snapshot.timeline.points, activeTimelineSeriesDefs);
            const startLabel = formatTimelineAxisLabel(snapshot.timeline.points[0], snapshot.timeline.bucketMode, snapshot.timeline.points.length);
            const midLabel = formatTimelineAxisLabel(snapshot.timeline.points[Math.floor(snapshot.timeline.points.length / 2)], snapshot.timeline.bucketMode, snapshot.timeline.points.length);
            const endLabel = formatTimelineAxisLabel(snapshot.timeline.points[snapshot.timeline.points.length - 1], snapshot.timeline.bucketMode, snapshot.timeline.points.length);
            const activeKpiLabel = snapshot.timeline.bucketMode === 'week'
                ? 'active weeks'
                : (snapshot.timeline.bucketMode === 'month' ? 'active months' : 'active days');
            const peakKpiLabel = snapshot.timeline.bucketMode === 'week'
                ? 'peak/week'
                : (snapshot.timeline.bucketMode === 'month' ? 'peak/month' : 'peak/day');
            const timelineNote = snapshot.timeline.activityNote
                ? `<p class="viz-activity-note">${escapeHtml(snapshot.timeline.activityNote)}</p>`
                : '';
            const timelineLegend = activeTimelineSeriesDefs.map((series) => `
                <span class="viz-legend-item">
                    <span class="viz-legend-swatch" style="--viz-legend-color:${series.lineColor}"></span>
                    <span>${escapeHtml(series.label)}</span>
                </span>
            `).join('');
            const rangeControls = getAnalyticsRangeDefinitions().map((range) => `
                <button
                    class="viz-range-btn${range.key === activeRangeKey ? ' is-active' : ''}"
                    type="button"
                    data-viz-range="${range.key}"
                    title="${range.ariaLabel}"
                    aria-pressed="${range.key === activeRangeKey ? 'true' : 'false'}"
                >${range.label}</button>
            `).join('');
            const likesSeriesToggle = mode === 'likes'
                ? `
                    <label class="viz-line-mode-label" for="vizLikesMainOnlyInput">
                        <input type="checkbox" id="vizLikesMainOnlyInput" ${likesTimelineMainOnly ? 'checked' : ''}>
                        <span>Show only All likes line</span>
                    </label>
                `
                : '';

            const mixRows = snapshot.mix.length > 0
                ? snapshot.mix.map((entry) => {
                    return `
                        <div class="viz-mix-row">
                            <div class="viz-mix-top">
                                <span class="viz-mix-label">${escapeHtml(entry.label)}</span>
                                <span class="viz-mix-value">${formatNumber(entry.count)} (${entry.percent}%)</span>
                            </div>
                            <div class="viz-mix-track">
                                <div class="viz-mix-fill ${entry.colorClass}" style="width:${entry.percent}%"></div>
                            </div>
                        </div>
                    `;
                }).join('')
                : '<div class="viz-empty">No data in selected range.</div>';

            const topRows = snapshot.topAuthors.length > 0
                ? snapshot.topAuthors.map((entry, idx) => {
                    const handle = entry.handle ? `@${entry.handle}` : shortDid(entry.did);
                    const query = entry.handle || entry.did;
                    const name = entry.displayName || entry.handle || shortDid(entry.did);
                    const avatar = entry.avatar || 'https://via.placeholder.com/28';
                    return `
                        <li>
                            <button class="viz-top-btn" type="button" data-author-query="${escapeHtml(query)}" title="Filter by author">
                                <span class="viz-top-rank">${idx + 1}</span>
                                <img class="viz-top-avatar" src="${escapeHtml(avatar)}" alt="">
                                <span class="viz-top-meta">
                                    <span class="viz-top-name">${escapeHtml(name)}</span>
                                    <span class="viz-top-handle">${escapeHtml(handle)}</span>
                                </span>
                                <span class="viz-top-count">${formatNumber(entry.count)}</span>
                            </button>
                        </li>
                    `;
                }).join('')
                : `<li class="viz-empty">${mode === 'likes' ? 'No liked authors found.' : 'No interaction targets found.'}</li>`;
            const hasAuthorFilter = Boolean(elements.searchAuthor.value.trim());
            const resetAuthorControl = hasAuthorFilter
                ? `<button class="viz-reset-btn" type="button" id="vizResetAuthorBtn">Reset author</button>`
                : '';

            elements.visualizations.innerHTML = `
                <div class="viz-card viz-card-wide">
                    <div class="viz-head">
                        <div>
                            <h4>Activity timeline</h4>
                            <p>${timelineTitle}</p>
                            <p class="viz-activity-note">${timelineScopeNote}</p>
                            ${analyticsOnlyNote}
                            ${timelineNote}
                            <div class="viz-range-controls" role="group" aria-label="Timeline range">
                                ${rangeControls}
                            </div>
                            ${likesSeriesToggle}
                        </div>
                        <div class="viz-kpis">
                            <div class="viz-kpi"><span class="viz-kpi-value">${formatNumber(snapshot.total)}</span><span class="viz-kpi-label">${activityLabel}</span></div>
                            <div class="viz-kpi"><span class="viz-kpi-value">${formatNumber(snapshot.activeDays)}</span><span class="viz-kpi-label">${activeKpiLabel}</span></div>
                            <div class="viz-kpi"><span class="viz-kpi-value">${formatNumber(snapshot.peak.count)}</span><span class="viz-kpi-label">${peakKpiLabel}</span></div>
                        </div>
                    </div>
                    <div class="viz-chart-shell">
                        ${timelineSvg}
                        <div class="viz-tooltip" aria-hidden="true"></div>
                    </div>
                    <div class="viz-axis-labels">
                        <span>${startLabel}</span>
                        <span>${midLabel}</span>
                        <span>${endLabel}</span>
                    </div>
                    <div class="viz-legend">${timelineLegend}</div>
                </div>
                <div class="viz-card">
                    <div class="viz-head viz-head-tight">
                        <div>
                            <h4>Content mix</h4>
                            <p>Current analytics range</p>
                        </div>
                    </div>
                    <div class="viz-mix">${mixRows}</div>
                </div>
                <div class="viz-card">
                    <div class="viz-head viz-head-tight">
                        <div>
                            <h4>${mode === 'likes' ? 'Top liked authors' : 'Top interaction targets'}</h4>
                            <p>Click to filter by author</p>
                        </div>
                        ${resetAuthorControl}
                    </div>
                    <ul class="viz-top-list">${topRows}</ul>
                </div>
            `;
            elements.visualizations.style.display = 'grid';
            elements.visualizations.classList.add('has-data');
            setAnalyticsToggleVisible(true);
            setAnalyticsExpanded(analyticsExpanded);
            attachTimelineInteractions(mode, activeTimelineSeriesDefs);

            const likesMainOnlyInput = document.getElementById('vizLikesMainOnlyInput');
            if (likesMainOnlyInput) {
                likesMainOnlyInput.addEventListener('change', () => {
                    likesTimelineMainOnly = likesMainOnlyInput.checked;
                    pulseVisualizationRangeTransition();
                    rerenderCurrentView();
                });
            }

            const resetAuthorBtn = document.getElementById('vizResetAuthorBtn');
            if (resetAuthorBtn) {
                resetAuthorBtn.addEventListener('click', (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    elements.searchAuthor.value = '';
                    toggleClearButton(elements.searchAuthor);
                    elements.filterBanner.classList.remove('show');
                    if (hasExpensiveFilters()) {
                        applyFiltersImmediate();
                    } else {
                        rerenderCurrentView();
                    }
                    updateCoverageHint();
                });
            }

            elements.visualizations.querySelectorAll('.viz-top-btn').forEach((btn) => {
                btn.addEventListener('click', async (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    const query = btn.getAttribute('data-author-query');
                    if (!query) return;
                    elements.searchAuthor.value = query;
                    toggleClearButton(elements.searchAuthor);
                    setAdvancedFiltersExpanded(true);
                    await handleFilterChange();
                });
            });

            elements.visualizations.querySelectorAll('.viz-range-btn').forEach((btn) => {
                btn.addEventListener('click', async () => {
                    if (isLoading) return;
                    const nextRange = btn.getAttribute('data-viz-range');
                    if (!nextRange) return;

                    if (nextRange === 'custom') {
                        setAdvancedFiltersExpanded(true);
                        if (!elements.dateFrom.value && !elements.dateTo.value) {
                            elements.dateFrom.focus();
                        } else {
                            await handleFilterChange();
                        }
                        return;
                    }

                    if (analyticsRangePreset === nextRange && !elements.dateFrom.value && !elements.dateTo.value) return;
                    analyticsRangePreset = nextRange;
                    if (elements.dateFrom.value || elements.dateTo.value) {
                        elements.dateFrom.value = '';
                        elements.dateTo.value = '';
                    }
                    const targetDate = getAnalyticsTargetStartDate(nextRange);
                    await ensureLoadedThroughDate(targetDate);
                    pulseVisualizationRangeTransition();
                    rerenderCurrentView();
                });
            });
        }

        function buildVisualizationSnapshot(rows, mode, rangeKey = ANALYTICS_RANGE_DEFAULT) {
            const normalized = rows.map((row) => {
                const post = row && row.post ? row.post : null;
                if (!post || !post.record) return null;
                const baseDate = mode === 'likes'
                    ? parseDateValue(row.likeTimestamp || post.record.createdAt)
                    : parseDateValue(post.record.createdAt);
                if (!baseDate) return null;
                return { ...row, post, _vizDate: baseDate };
            }).filter(Boolean);

            if (normalized.length === 0) return null;

            const timeline = buildTimelineBuckets(normalized, mode, rangeKey);
            const scopedRows = normalized.filter((row) => {
                const day = row && row._vizDate instanceof Date ? startOfDay(row._vizDate) : null;
                if (!day || Number.isNaN(day.getTime())) return false;
                if (timeline.start && day < timeline.start) return false;
                if (timeline.end && day > timeline.end) return false;
                return true;
            });
            const mix = buildMixBuckets(scopedRows, mode);
            const topAuthors = buildTopAuthors(scopedRows, mode, 6);
            const peak = timeline.points.reduce((max, point) => point.count > max.count ? point : max, { count: 0, day: timeline.points[0].day });
            const activeDays = timeline.points.filter((point) => point.count > 0).length;

            return {
                total: scopedRows.length,
                activeDays,
                peak,
                timeline,
                mix,
                topAuthors
            };
        }

        function buildTimelineBuckets(rows, mode, rangeKey = ANALYTICS_RANGE_DEFAULT, windowDays = 42) {
            const defs = getTimelineSeriesDefs(mode);
            const hasDateFrom = Boolean(elements.dateFrom.value);
            const hasDateTo = Boolean(elements.dateTo.value);
            let end = hasDateTo ? parseDateValue(`${elements.dateTo.value}T00:00:00`) : null;
            let start = hasDateFrom ? parseDateValue(`${elements.dateFrom.value}T00:00:00`) : null;

            let loadedMin = null;
            let loadedMax = null;
            rows.forEach((row) => {
                const date = row && row._vizDate instanceof Date ? startOfDay(row._vizDate) : null;
                if (!date || Number.isNaN(date.getTime())) return;
                if (!loadedMin || date < loadedMin) loadedMin = date;
                if (!loadedMax || date > loadedMax) loadedMax = date;
            });

            if (!hasDateFrom && !hasDateTo) {
                const range = getAnalyticsRangeDefinition(rangeKey);
                if (range.days) {
                    end = startOfDay(new Date());
                    start = addDays(end, -(range.days - 1));
                } else {
                    end = loadedMax || startOfDay(new Date());
                    start = loadedMin || addDays(end, -(windowDays - 1));
                }
            } else {
                if (!end) {
                    end = loadedMax || startOfDay(new Date());
                }
                if (!start) {
                    start = loadedMin || addDays(end, -(windowDays - 1));
                }
            }

            end = startOfDay(end || new Date());
            start = startOfDay(start || addDays(end, -(windowDays - 1)));

            if (start > end) {
                const tmp = start;
                start = end;
                end = tmp;
            }

            const dayCount = diffDaysInclusive(start, end);
            const bucketMode = chooseTimelineBucketMode(dayCount);
            const countsByDay = new Map();
            const seriesCountsByDay = new Map(defs.map((def) => [def.key, new Map()]));

            rows.forEach((row) => {
                const date = row._vizDate;
                if (!(date instanceof Date) || Number.isNaN(date.getTime())) return;
                const day = startOfDay(date);
                if (day < start || day > end) return;
                const dayKey = toDayKey(day);
                countsByDay.set(dayKey, (countsByDay.get(dayKey) || 0) + 1);

                const category = classifyVisualizationRow(row, mode);
                if (!seriesCountsByDay.has(category)) return;
                const bucket = seriesCountsByDay.get(category);
                bucket.set(dayKey, (bucket.get(dayKey) || 0) + 1);
            });

            const aggregateKeyForDay = (day) => {
                if (bucketMode === 'month') return toDayKey(startOfMonth(day));
                if (bucketMode === 'week') return toDayKey(startOfWeek(day));
                return toDayKey(day);
            };

            const pointsMap = new Map();
            for (let i = 0; i < dayCount; i += 1) {
                const day = addDays(start, i);
                const dayKey = toDayKey(day);
                const aggregateKey = aggregateKeyForDay(day);
                if (!pointsMap.has(aggregateKey)) {
                    const series = {};
                    defs.forEach((def) => {
                        series[def.key] = 0;
                    });
                    pointsMap.set(aggregateKey, {
                        key: aggregateKey,
                        day,
                        from: day,
                        to: day,
                        fromKey: dayKey,
                        toKey: dayKey,
                        count: 0,
                        series
                    });
                }

                const point = pointsMap.get(aggregateKey);
                point.to = day;
                point.toKey = dayKey;
                point.count += countsByDay.get(dayKey) || 0;
                defs.forEach((def) => {
                    if (def.key === 'allLikes') {
                        point.series[def.key] += countsByDay.get(dayKey) || 0;
                        return;
                    }
                    const bucket = seriesCountsByDay.get(def.key);
                    point.series[def.key] += bucket ? (bucket.get(dayKey) || 0) : 0;
                });
            }

            const points = [...pointsMap.values()].map((point) => ({
                ...point,
                label: formatTimelineRangeLabel(point.from, point.to, bucketMode)
            }));

            const activeSeriesDefs = defs.filter((def) =>
                points.some((point) => Number((point.series && point.series[def.key]) || 0) > 0)
            );
            const seriesDefs = activeSeriesDefs.length > 0 ? activeSeriesDefs : defs;

            const isComplete = allPostsLoaded || !currentCursor;
            const firstActivePoint = points.find((point) => point.count > 0) || null;
            let activityNote = '';
            if (!firstActivePoint) {
                activityNote = isComplete
                    ? 'No matching activity in this date range.'
                    : 'No matching activity in currently loaded results for this date range.';
            }

            return {
                points,
                windowDays: dayCount,
                start,
                end,
                isComplete,
                activityNote,
                seriesDefs,
                bucketMode
            };
        }

        function buildTimelineSvg(points, seriesDefs) {
            if (!Array.isArray(points) || points.length === 0) {
                return '';
            }

            const defs = Array.isArray(seriesDefs) && seriesDefs.length > 0
                ? seriesDefs
                : [{ key: 'total', label: 'Total', lineColor: '#3b82f6' }];
            const width = 640;
            const height = 208;
            const topPad = 12;
            const sidePad = 12;
            const bottomPad = 24;
            const innerWidth = width - (sidePad * 2);
            const innerHeight = height - topPad - bottomPad;
            const baseline = topPad + innerHeight;
            const getValue = (point, key) => {
                if (key === 'total') return Number(point.count || 0);
                return Number((point.series && point.series[key]) || 0);
            };
            const maxCount = Math.max(
                1,
                ...defs.map((def) =>
                    Math.max(...points.map((point) => getValue(point, def.key)), 0)
                )
            );
            const divisor = Math.max(points.length - 1, 1);

            const xPositions = points.map((_, idx) => sidePad + ((innerWidth * idx) / divisor));
            const seriesHtml = defs.map((def) => {
                const coords = points.map((point, idx) => {
                    const x = xPositions[idx];
                    const value = getValue(point, def.key);
                    const ratio = value / maxCount;
                    const y = baseline - (ratio * innerHeight);
                    return { x, y, value, key: point.key };
                });
                const linePath = coords
                    .map((coord, idx) => `${idx === 0 ? 'M' : 'L'} ${coord.x.toFixed(2)} ${coord.y.toFixed(2)}`)
                    .join(' ');
                const pointsHtml = coords.map((coord) => `
                    <circle
                        class="viz-point${coord.value > 0 ? ' is-active' : ''}"
                        data-day="${coord.key}"
                        cx="${coord.x.toFixed(2)}"
                        cy="${coord.y.toFixed(2)}"
                        r="${coord.value > 0 ? 2.2 : 1.8}"
                        style="--viz-point-color:${def.lineColor};"
                    ></circle>
                `).join('');
                return `
                    <path class="viz-series-line" style="--viz-line-color:${def.lineColor};--viz-line-width:${def.lineWidth || 1.35};" d="${linePath}"></path>
                    ${pointsHtml}
                `;
            }).join('');

            const grid = [0.25, 0.5, 0.75, 1].map((step) => {
                const y = (topPad + (innerHeight * (1 - step))).toFixed(2);
                return `<line class="viz-grid-line" x1="${sidePad}" y1="${y}" x2="${width - sidePad}" y2="${y}"></line>`;
            }).join('');

            const hitsHtml = points.map((point, idx) => {
                const currentX = xPositions[idx];
                const left = idx === 0 ? sidePad : (xPositions[idx - 1] + currentX) / 2;
                const right = idx === xPositions.length - 1 ? width - sidePad : (currentX + xPositions[idx + 1]) / 2;
                const hitWidth = Math.max(right - left, 1);
                const seriesData = defs.map((def) => `${def.key}:${getValue(point, def.key)}`).join(',');
                const label = point.label || formatEuDate(point.day);
                const fromKey = point.fromKey || point.key;
                const toKey = point.toKey || point.key;
                return `
                    <rect
                        class="viz-hit"
                        data-day="${point.key}"
                        data-label="${escapeHtml(label)}"
                        data-from="${fromKey}"
                        data-to="${toKey}"
                        data-count="${point.count}"
                        data-series="${seriesData}"
                        x="${left.toFixed(2)}"
                        y="${topPad}"
                        width="${hitWidth.toFixed(2)}"
                        height="${innerHeight.toFixed(2)}"
                        tabindex="0"
                        role="button"
                        aria-label="${escapeHtml(label)}: ${point.count}"
                    ></rect>
                `;
            }).join('');

            return `
                <svg class="viz-chart-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="Activity timeline">
                    ${grid}
                    ${seriesHtml}
                    ${hitsHtml}
                </svg>
            `;
        }

        function attachTimelineInteractions(mode, seriesDefs = []) {
            if (!elements.visualizations) return;
            const shell = elements.visualizations.querySelector('.viz-chart-shell');
            if (!shell) return;

            const tooltip = shell.querySelector('.viz-tooltip');
            const hits = [...shell.querySelectorAll('.viz-hit')];
            if (!tooltip || hits.length === 0) return;

            const unitLabel = mode === 'likes' ? 'likes' : 'posts';
            const labelsByKey = new Map(
                (Array.isArray(seriesDefs) ? seriesDefs : []).map((def) => [def.key, def.label])
            );

            const show = (hit, event) => {
                const dayKey = hit.getAttribute('data-day') || '';
                const rangeLabel = hit.getAttribute('data-label') || '';
                const count = Number(hit.getAttribute('data-count') || 0);
                const rawSeries = hit.getAttribute('data-series') || '';
                const dayDate = parseDateValue(`${dayKey}T00:00:00`) || new Date();
                const dateText = rangeLabel || formatEuDate(dayDate);
                const seriesRows = rawSeries
                    .split(',')
                    .map((chunk) => chunk.trim())
                    .filter(Boolean)
                    .map((chunk) => {
                        const [rawKey, rawCount] = chunk.split(':');
                        const parsedCount = Number(rawCount || 0);
                        return {
                            key: rawKey,
                            label: labelsByKey.get(rawKey) || rawKey,
                            count: Number.isFinite(parsedCount) ? parsedCount : 0
                        };
                    })
                    .filter((entry) => entry.key !== 'allLikes')
                    .filter((entry) => entry.count > 0)
                    .sort((a, b) => b.count - a.count);
                const seriesHtml = seriesRows.map((entry) => `
                    <div class="viz-tooltip-row">
                        <span>${escapeHtml(entry.label)}</span>
                        <strong>${formatNumber(entry.count)}</strong>
                    </div>
                `).join('');
                tooltip.innerHTML = `
                    <div class="viz-tooltip-date">${escapeHtml(dateText)}</div>
                    <div class="viz-tooltip-total">${formatNumber(count)} ${unitLabel}</div>
                    ${seriesHtml}
                `;
                tooltip.classList.add('show');
                tooltip.setAttribute('aria-hidden', 'false');
                setTimelineActiveState(shell, dayKey);

                const shellRect = shell.getBoundingClientRect();
                const fallbackRect = hit.getBoundingClientRect();
                const anchorX = event && typeof event.clientX === 'number'
                    ? event.clientX
                    : (fallbackRect.left + fallbackRect.width / 2);
                const anchorY = event && typeof event.clientY === 'number'
                    ? event.clientY
                    : fallbackRect.top;

                const tooltipRect = tooltip.getBoundingClientRect();
                let left = anchorX - shellRect.left + 12;
                let top = anchorY - shellRect.top - tooltipRect.height - 10;

                if (left + tooltipRect.width > shellRect.width - 6) {
                    left = shellRect.width - tooltipRect.width - 6;
                }
                if (left < 6) left = 6;
                if (top < 6) top = 6;

                tooltip.style.left = `${left}px`;
                tooltip.style.top = `${top}px`;
            };

            const hide = () => {
                tooltip.classList.remove('show');
                tooltip.setAttribute('aria-hidden', 'true');
                setTimelineActiveState(shell, '');
            };

            hits.forEach((hit) => {
                hit.addEventListener('mouseenter', (event) => show(hit, event));
                hit.addEventListener('mousemove', (event) => show(hit, event));
                hit.addEventListener('focus', () => show(hit, null));
                hit.addEventListener('blur', hide);
                hit.addEventListener('click', async (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    const fromKey = hit.getAttribute('data-from') || hit.getAttribute('data-day') || '';
                    const toKey = hit.getAttribute('data-to') || fromKey;
                    await applyTimelineDayFilter(fromKey, toKey);
                });
                hit.addEventListener('keydown', async (event) => {
                    if (event.key !== 'Enter' && event.key !== ' ') return;
                    event.preventDefault();
                    const fromKey = hit.getAttribute('data-from') || hit.getAttribute('data-day') || '';
                    const toKey = hit.getAttribute('data-to') || fromKey;
                    await applyTimelineDayFilter(fromKey, toKey);
                });
            });

            shell.addEventListener('mouseleave', hide);
        }

        function setTimelineActiveState(shell, dayKey) {
            const hits = shell.querySelectorAll('.viz-hit');
            const points = shell.querySelectorAll('.viz-point');
            hits.forEach((hit) => {
                hit.classList.toggle('is-active', Boolean(dayKey) && hit.getAttribute('data-day') === dayKey);
            });
            points.forEach((point) => {
                point.classList.toggle('is-selected', Boolean(dayKey) && point.getAttribute('data-day') === dayKey);
            });
        }

        async function applyTimelineDayFilter(dayKey, endDayKey = dayKey) {
            if (!dayKey) return;
            const rangeStart = dayKey <= endDayKey ? dayKey : endDayKey;
            const rangeEnd = dayKey <= endDayKey ? endDayKey : dayKey;
            elements.dateFrom.value = rangeStart;
            elements.dateTo.value = rangeEnd;
            setAdvancedFiltersExpanded(true);
            await handleFilterChange();
        }

        function getAnalyticsRangeDefinitions() {
            return [
                { key: '7d', label: 'Week', scopeLabel: 'last week', ariaLabel: 'Show last week', days: 7 },
                { key: '30d', label: 'Month', scopeLabel: 'last month', ariaLabel: 'Show last month', days: 30 },
                { key: '365d', label: 'Year', scopeLabel: 'last year', ariaLabel: 'Show last year', days: 365 },
                { key: 'custom', label: 'Custom', scopeLabel: 'custom range', ariaLabel: 'Use custom date range', days: null }
            ];
        }

        function getAnalyticsRangeDefinition(key) {
            const ranges = getAnalyticsRangeDefinitions();
            const match = ranges.find((range) => range.key === key);
            return match || ranges.find((range) => range.key === ANALYTICS_RANGE_DEFAULT) || ranges[1];
        }

        function getAnalyticsTargetStartDate(rangeKey) {
            if (rangeKey === 'custom') {
                const fromDate = elements.dateFrom.value ? parseDateValue(`${elements.dateFrom.value}T00:00:00`) : null;
                const toDate = elements.dateTo.value ? parseDateValue(`${elements.dateTo.value}T00:00:00`) : null;
                if (fromDate && toDate) {
                    return startOfDay(fromDate <= toDate ? fromDate : toDate);
                }
                if (fromDate) {
                    return startOfDay(fromDate);
                }
                // Date-to only has no lower bound, so full coverage requires full history.
                return null;
            }

            const range = getAnalyticsRangeDefinition(rangeKey);
            if (!range || !range.days) return null;
            return addDays(startOfDay(new Date()), -(range.days - 1));
        }

        function getOldestLoadedActivityDate() {
            if (!Array.isArray(allPosts) || allPosts.length === 0) return null;
            let oldest = null;
            allPosts.forEach((item) => {
                const fallbackDate = item && item.post && item.post.record ? item.post.record.createdAt : null;
                const rawValue = currentMode === 'likes'
                    ? (item && item.likeTimestamp ? item.likeTimestamp : fallbackDate)
                    : fallbackDate;
                const parsed = parseDateValue(rawValue);
                if (!parsed) return;
                const day = startOfDay(parsed);
                if (!oldest || day < oldest) oldest = day;
            });
            return oldest;
        }

        function isLoadedThroughDate(targetDate) {
            const normalizedTarget = targetDate instanceof Date ? startOfDay(targetDate) : null;
            if (!normalizedTarget) return allPostsLoaded || !currentCursor;
            const oldestLoaded = getOldestLoadedActivityDate();
            if (!oldestLoaded) return false;
            return oldestLoaded <= normalizedTarget || allPostsLoaded || !currentCursor;
        }

        async function ensureLoadedThroughDate(targetDate) {
            const normalizedTarget = targetDate instanceof Date ? startOfDay(targetDate) : null;
            if (!normalizedTarget || !currentDid) return;
            if (isLoadedThroughDate(normalizedTarget)) return;
            if (!currentCursor) return;

            let batchGuard = 0;
            setLoading(true);
            try {
                while (currentCursor && batchGuard < 250) {
                    if (isLoadedThroughDate(normalizedTarget)) break;
                    const beforeCount = allPosts.length;
                    const beforeCursor = currentCursor;

                    if (currentMode === 'posts') {
                        await loadPosts(true);
                    } else {
                        await loadLikes(true);
                    }

                    batchGuard += 1;
                    if (allPosts.length === beforeCount && currentCursor === beforeCursor) {
                        break;
                    }
                }
            } finally {
                setLoading(false);
            }
        }

        function chooseTimelineBucketMode(dayCount) {
            if (dayCount > 540) return 'month';
            if (dayCount > 120) return 'week';
            return 'day';
        }

        function formatTimelineRangeLabel(fromDate, toDate, bucketMode) {
            if (!(fromDate instanceof Date) || Number.isNaN(fromDate.getTime())) return '';
            if (!(toDate instanceof Date) || Number.isNaN(toDate.getTime())) return formatEuDate(fromDate);
            if (bucketMode === 'day' || toDayKey(fromDate) === toDayKey(toDate)) {
                return formatEuDate(fromDate);
            }
            return `${formatEuDate(fromDate)} - ${formatEuDate(toDate)}`;
        }

        function getVisualizationTypeDefs(mode) {
            if (mode === 'likes') {
                return [
                    { key: 'text', label: 'Text only', colorClass: 'viz-fill-text', lineColor: '#3b82f6' },
                    { key: 'links', label: 'Links', colorClass: 'viz-fill-links', lineColor: '#6366f1' },
                    { key: 'media', label: 'Media', colorClass: 'viz-fill-media', lineColor: '#ef4444' },
                    { key: 'replies', label: 'Replies', colorClass: 'viz-fill-replies', lineColor: '#0ea5e9' },
                    { key: 'quotes', label: 'Quotes', colorClass: 'viz-fill-quotes', lineColor: '#f59e0b' }
                ];
            }
            return [
                { key: 'originals', label: 'Originals', colorClass: 'viz-fill-originals', lineColor: '#3b82f6' },
                { key: 'replies', label: 'Replies', colorClass: 'viz-fill-replies', lineColor: '#0ea5e9' },
                { key: 'reposts', label: 'Reposts', colorClass: 'viz-fill-reposts', lineColor: '#14b8a6' },
                { key: 'quotes', label: 'Quotes', colorClass: 'viz-fill-quotes', lineColor: '#f59e0b' },
                { key: 'links', label: 'Links', colorClass: 'viz-fill-links', lineColor: '#6366f1' }
            ];
        }

        function getTimelineSeriesDefs(mode) {
            const defs = getVisualizationTypeDefs(mode);
            if (mode !== 'likes') return defs;
            return [
                { key: 'allLikes', label: 'All likes', lineColor: '#14b8a6', lineWidth: 1.8 },
                ...defs
            ];
        }

        function buildMixBuckets(rows, mode) {
            const defs = getVisualizationTypeDefs(mode);

            const counts = new Map(defs.map((def) => [def.key, 0]));
            rows.forEach((row) => {
                const category = classifyVisualizationRow(row, mode);
                if (!counts.has(category)) return;
                counts.set(category, counts.get(category) + 1);
            });

            const total = rows.length || 1;
            return defs
                .map((def) => {
                    const count = counts.get(def.key) || 0;
                    return {
                        ...def,
                        count,
                        percent: Math.round((count / total) * 100)
                    };
                })
                .filter((entry) => entry.count > 0);
        }

        function buildTopAuthors(rows, mode, limit = 6) {
            const counts = new Map();

            rows.forEach((row) => {
                if (mode === 'likes') {
                    addAuthorCount(counts, row.post && row.post.author ? row.post.author : null);
                    return;
                }

                const targets = collectInteractionTargets(row);
                targets.forEach((author) => {
                    if (!isSelfAuthor(author)) addAuthorCount(counts, author);
                });
            });

            if (mode !== 'likes' && counts.size === 0) {
                rows.forEach((row) => {
                    const author = row.post && row.post.author ? row.post.author : null;
                    if (!isSelfAuthor(author)) addAuthorCount(counts, author);
                });
            }

            return [...counts.values()]
                .sort((a, b) => b.count - a.count)
                .slice(0, limit);
        }

        function collectInteractionTargets(row) {
            const targets = [];
            const seen = new Set();
            const push = (author) => {
                if (!author || typeof author !== 'object') return;
                const key = author.did || author.handle;
                if (!key || seen.has(key)) return;
                seen.add(key);
                targets.push(author);
            };

            const postAuthor = row.post && row.post.author ? row.post.author : null;
            if (row.reason && row.reason.$type === 'app.bsky.feed.defs#reasonRepost') {
                push(postAuthor);
            }

            const replyAuthor = row.reply && row.reply.parent && row.reply.parent.author ? row.reply.parent.author : null;
            push(replyAuthor);
            push(getQuoteAuthor(row.post));

            return targets;
        }

        function addAuthorCount(map, author) {
            if (!author || typeof author !== 'object') return;
            const key = author.did || author.handle;
            if (!key) return;
            if (!map.has(key)) {
                map.set(key, {
                    did: author.did || '',
                    handle: author.handle || '',
                    displayName: author.displayName || '',
                    avatar: author.avatar || '',
                    count: 0
                });
            }
            map.get(key).count += 1;
        }

        function isSelfAuthor(author) {
            if (!author || typeof author !== 'object') return false;
            const authorDid = typeof author.did === 'string' ? author.did : '';
            if (authorDid && currentDid && authorDid === currentDid) return true;

            const authorHandle = typeof author.handle === 'string' ? author.handle.toLowerCase() : '';
            const profileHandle = currentProfile && typeof currentProfile.handle === 'string'
                ? currentProfile.handle.toLowerCase()
                : '';
            return Boolean(authorHandle && profileHandle && authorHandle === profileHandle);
        }

        function classifyVisualizationRow(row, mode) {
            const post = row && row.post ? row.post : null;
            if (!post || !post.record) return mode === 'likes' ? 'text' : 'originals';

            if (mode === 'likes') {
                if (post.record.reply) return 'replies';
                if (isQuotePost(post)) return 'quotes';
                if (postHasMedia(post)) return 'media';
                if (postHasLink(post)) return 'links';
                return 'text';
            }

            if (row.reason && row.reason.$type === 'app.bsky.feed.defs#reasonRepost') return 'reposts';
            if (post.record.reply) return 'replies';
            if (isQuotePost(post)) return 'quotes';
            if (postHasLink(post)) return 'links';
            return 'originals';
        }

        function filterPostsForDisplay(feed) {
            const hideReposts = elements.hideReposts.checked;
            const hideReplies = elements.hideReplies.checked;
            const hideQuotes = elements.hideQuotes.checked;
            const onlyLinks = elements.onlyLinks.checked;

            let filteredFeed = Array.isArray(feed) ? feed : [];
            if (hideReposts) {
                filteredFeed = filteredFeed.filter((item) => !item.reason || item.reason.$type !== 'app.bsky.feed.defs#reasonRepost');
            }
            if (hideReplies) {
                filteredFeed = filteredFeed.filter((item) => !(item.post && item.post.record && item.post.record.reply));
            }
            if (hideQuotes) {
                filteredFeed = filteredFeed.filter((item) => !isQuotePost(item.post));
            }
            if (onlyLinks) {
                filteredFeed = filteredFeed.filter((item) => {
                    const isRepost = Boolean(item.reason && item.reason.$type === 'app.bsky.feed.defs#reasonRepost');
                    if (isRepost) return false;
                    return postHasLink(item.post);
                });
            }
            return filteredFeed;
        }

        function buildLikeRowsFromStore() {
            return allPosts.map((item) => ({
                post: item.post,
                reason: null,
                reply: item.reply || null,
                likeTimestamp: item.likeTimestamp,
                _highlight: item._highlight || null
            }));
        }

        function filterLikeRowsForDisplay(rows) {
            let filtered = Array.isArray(rows) ? rows : [];
            if (elements.hideQuotes.checked) {
                filtered = filtered.filter((row) => !isQuotePost(row.post));
            }
            if (elements.onlyLinks.checked) {
                filtered = filtered.filter((row) => postHasLink(row.post));
            }
            return filtered;
        }

        function postHasMedia(post) {
            if (!post || !post.embed) return false;
            const type = post.embed.$type || '';
            if (type.includes('images') || type.includes('video') || type.includes('external')) return true;
            if (type === 'app.bsky.embed.recordWithMedia#view' && post.embed.media) {
                const mediaType = post.embed.media.$type || '';
                return mediaType.includes('images') || mediaType.includes('video') || mediaType.includes('external');
            }
            return false;
        }

        function shortDid(did) {
            if (!did) return '';
            if (did.length <= 24) return did;
            return `${did.slice(0, 14)}…${did.slice(-6)}`;
        }

        function formatMiniDate(date) {
            if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
            const day = String(date.getDate()).padStart(2, '0');
            const month = String(date.getMonth() + 1).padStart(2, '0');
            return `${day}/${month}`;
        }

        function formatMiniDateWithYear(date) {
            if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
            const day = String(date.getDate()).padStart(2, '0');
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const year = String(date.getFullYear()).slice(-2);
            return `${day}/${month}/${year}`;
        }

        function formatMonthYear(date) {
            if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const year = String(date.getFullYear()).slice(-2);
            return `${month}/${year}`;
        }

        function formatTimelineAxisLabel(point, bucketMode, pointCount = 0) {
            if (!point || !(point.from instanceof Date)) return '';
            if (bucketMode === 'month') return formatMonthYear(point.from);
            if (bucketMode === 'week') return formatMiniDateWithYear(point.from);
            if (pointCount > 180) return formatMiniDateWithYear(point.from);
            return formatMiniDate(point.from);
        }

        function startOfDay(date) {
            const day = new Date(date);
            day.setHours(0, 0, 0, 0);
            return day;
        }

        function startOfWeek(date) {
            const day = startOfDay(date);
            const mondayOffset = (day.getDay() + 6) % 7;
            return addDays(day, -mondayOffset);
        }

        function startOfMonth(date) {
            const day = startOfDay(date);
            day.setDate(1);
            return day;
        }

        function addDays(date, amount) {
            const result = new Date(date);
            result.setDate(result.getDate() + amount);
            return result;
        }

        function diffDaysInclusive(start, end) {
            const msPerDay = 24 * 60 * 60 * 1000;
            const diff = Math.floor((end.getTime() - start.getTime()) / msPerDay);
            return Math.max(1, diff + 1);
        }

        function toDayKey(date) {
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        }

        function displayLikePosts(posts, likeRecords, append = false, highlights = null) {
            if (!append) {
                elements.content.innerHTML = '';
            }

            if (posts.length === 0 && !append) {
                elements.content.innerHTML = `
                    <div class="empty-state">
                        <p>No likes found</p>
                    </div>
                `;
                clearVisualizations();
                return;
            }

            const likeTimestamps = {};
            likeRecords.forEach((record) => {
                likeTimestamps[record.value.subject.uri] = new Date(record.value.createdAt);
            });

            const highlightByUri = new Map();
            if (Array.isArray(highlights)) {
                posts.forEach((post, idx) => {
                    if (post && post.uri && highlights[idx]) {
                        highlightByUri.set(post.uri, highlights[idx]);
                    }
                });
            }

            let likeRows = posts.map((post) => ({
                post,
                reason: null,
                reply: post && post.reply ? post.reply : null,
                likeTimestamp: likeTimestamps[post.uri] || null,
                _highlight: highlightByUri.get(post.uri) || null
            }));

            likeRows = filterLikeRowsForDisplay(likeRows);

            likeRows.sort((a, b) => {
                const timeA = a.likeTimestamp || new Date(0);
                const timeB = b.likeTimestamp || new Date(0);
                const sortOldest = elements.sortOldest.checked && allPostsLoaded;
                return sortOldest ? (timeA - timeB) : (timeB - timeA);
            });

            likeRows.forEach((row) => {
                const postDiv = createPostElement(row.post, null, row.reply, row._highlight, row.likeTimestamp);
                elements.content.appendChild(postDiv);
            });

            const visualRows = append ? filterLikeRowsForDisplay(buildLikeRowsFromStore()) : likeRows;
            renderVisualizations(visualRows, 'likes');
        }

        function displayPosts(feed, append = false) {
            let filteredFeed = filterPostsForDisplay(feed);

            if (!append) {
                elements.content.innerHTML = '';
            }

            if (filteredFeed.length === 0 && !append) {
                elements.content.innerHTML = `
                    <div class="empty-state">
                        <p>No ${currentMode} found</p>
                    </div>
                `;
                clearVisualizations();
                return;
            }

            if (elements.sortOldest.checked && allPostsLoaded) {
                filteredFeed = [...filteredFeed].sort((a, b) => {
                    const timeA = new Date(a.post?.record?.createdAt || 0);
                    const timeB = new Date(b.post?.record?.createdAt || 0);
                    return timeA - timeB;
                });
            }

            filteredFeed.forEach(item => {
                const post = item.post;
                const postDiv = createPostElement(post, item.reason, item.reply, item._highlight || null, null);
                elements.content.appendChild(postDiv);
            });

            const visualFeed = append ? filterPostsForDisplay(allPosts) : filteredFeed;
            renderVisualizations(visualFeed, 'posts');
        }

        function createPostElement(post, reason, reply, highlight, timestampOverride) {
            const div = document.createElement('div');
            div.className = 'post';
            
            const author = post.author;
            const record = post.record;
            const avatar = author.avatar || 'https://via.placeholder.com/40';
            
            const timestamp = timestampOverride ? new Date(timestampOverride) : new Date(record.createdAt);
            const timeLabel = formatEuDate(timestamp);
            
            let postText = escapeHtml(record.text || '');
            
            if (record.facets && record.facets.length > 0) {
                postText = applyFacets(record.text, record.facets);
            }

            if (highlight && (!record.facets || record.facets.length === 0)) {
                postText = applyHighlights(postText, highlight);
            }

            let html = '';
            if (reason && reason.$type === 'app.bsky.feed.defs#reasonRepost') {
                html += `<div class="repost-indicator">Reposted by @${escapeHtml(reason.by.handle)}</div>`;
            }
            
            if (reply && reply.parent) {
                const parentAuthor = reply.parent.author;
                if (parentAuthor && parentAuthor.handle) {
                    html += `<div class="reply-indicator">Reply to @${escapeHtml(parentAuthor.handle)}</div>`;
                }
            } else if (record.reply && record.reply.parent) {
                html += `<div class="reply-indicator">Reply</div>`;
            }

            const quoteHandle = getQuoteHandle(post);
            if (quoteHandle) {
                html += `<div class="quote-indicator">Quote @${escapeHtml(quoteHandle)}</div>`;
            }

            html += `
                <div class="post-header">
                    <img src="${avatar}" alt="${escapeHtml(author.displayName || author.handle)}" class="post-avatar">
                    <div class="post-author">
                        <div class="post-name">${escapeHtml(author.displayName || author.handle)}</div>
                        <div class="post-handle">@${escapeHtml(author.handle)}</div>
                    </div>
                    <div class="post-time">${timeLabel}</div>
                    <div class="post-actions">
                        <button class="copy-link-btn" type="button" data-post-uri="${escapeHtml(post.uri)}" aria-label="Copy post link">Copy link</button>
                    </div>
                </div>
                <div class="post-text">${postText}</div>
            `;

            const replyPreview = buildReplyPreview(reply);
            if (replyPreview) {
                html += replyPreview;
            }

            const quotePreview = buildQuotePreview(post);
            if (quotePreview) {
                html += quotePreview;
            }

            if (post.embed && post.embed.$type === 'app.bsky.embed.images#view') {
                const images = post.embed.images || [];
                images.forEach(img => {
                    html += `<img src="${img.thumb}" alt="${escapeHtml(img.alt || '')}" class="post-image">`;
                });
            }

            html += `
                <div class="post-engagement">
                    <span class="engagement-item">${formatNumber(post.replyCount || 0)} replies</span>
                    <span class="engagement-item">${formatNumber(post.repostCount || 0)} reposts</span>
                    <span class="engagement-item">${formatNumber(post.likeCount || 0)} likes</span>
                </div>
            `;

            div.innerHTML = html;
            
            div.addEventListener('click', () => {
                const postUrl = `https://bsky.app/profile/${author.handle}/post/${post.uri.split('/').pop()}`;
                window.open(postUrl, '_blank');
            });

            const copyBtn = div.querySelector('.copy-link-btn');
            if (copyBtn) {
                copyBtn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const uri = copyBtn.getAttribute('data-post-uri');
                    const postId = uri ? uri.split('/').pop() : '';
                    const postUrl = postId ? `https://bsky.app/profile/${author.handle}/post/${postId}` : '';
                    if (!postUrl) return;
                    try {
                        if (navigator.clipboard) {
                            await navigator.clipboard.writeText(postUrl);
                            const original = copyBtn.textContent;
                            copyBtn.textContent = 'Copied';
                            setTimeout(() => {
                                copyBtn.textContent = original;
                            }, 1200);
                        } else {
                            window.prompt('Copy this post URL:', postUrl);
                        }
                    } catch (err) {
                        showError('Could not copy link');
                    }
                });
            }

            return div;
        }

        function isQuotePost(post) {
            if (!post || !post.embed) return false;
            const type = post.embed.$type || '';
            if (type === 'app.bsky.embed.record#view') return true;
            if (type === 'app.bsky.embed.recordWithMedia#view') return true;
            return false;
        }

        function getEmbeddedRecordView(embed) {
            if (!embed) return null;
            if (embed.$type === 'app.bsky.embed.record#view') {
                return embed.record || null;
            }
            if (embed.$type === 'app.bsky.embed.recordWithMedia#view') {
                return embed.record || null;
            }
            return null;
        }

        async function fetchLatestRecordDate(collection) {
            if (!currentDid || !currentPdsUrl) return null;
            try {
                const [reverseDate, forwardDate] = await Promise.all([
                    fetchFirstRecordDate(collection, true),
                    fetchFirstRecordDate(collection, false)
                ]);

                if (reverseDate && forwardDate && reverseDate > forwardDate) {
                    return reverseDate;
                }

                // If reverse is unsupported or inconclusive, scan forward (capped).
                const scan = await scanMaxRecordDate(collection, 2000);
                return scan || reverseDate || forwardDate || null;
            } catch (e) {
                return null;
            }
        }

        async function fetchFirstRecordDate(collection, reverse) {
            const url = `${currentPdsUrl}/xrpc/com.atproto.repo.listRecords?repo=${encodeURIComponent(currentDid)}&collection=${encodeURIComponent(collection)}&limit=1${reverse ? '&reverse=true' : ''}`;
            const res = await fetch(url);
            if (!res.ok) return null;
            const data = await res.json();
            const first = data.records && data.records[0];
            if (first && first.value && first.value.createdAt) {
                return new Date(first.value.createdAt);
            }
            return null;
        }

        async function scanMaxRecordDate(collection, maxFetch = 2000) {
            let cursor = null;
            let scanned = 0;
            let maxDate = null;
            const pageSize = 100;
            while (scanned < maxFetch) {
                let url = `${currentPdsUrl}/xrpc/com.atproto.repo.listRecords?repo=${encodeURIComponent(currentDid)}&collection=${encodeURIComponent(collection)}&limit=${pageSize}`;
                if (cursor) url += `&cursor=${encodeURIComponent(cursor)}`;
                const res = await fetch(url);
                if (!res.ok) break;
                const data = await res.json();
                const records = data.records || [];
                if (records.length === 0) break;
                records.forEach(record => {
                    const createdAt = record && record.value && record.value.createdAt ? new Date(record.value.createdAt) : null;
                    if (createdAt && (!maxDate || createdAt > maxDate)) {
                        maxDate = createdAt;
                    }
                });
                scanned += records.length;
                cursor = data.cursor || null;
                if (!cursor) break;
            }
            return maxDate;
        }

        async function fetchLatestPostDate() {
            if (!currentDid) return null;
            try {
                const url = `${API_PUBLIC}/app.bsky.feed.getAuthorFeed?actor=${encodeURIComponent(currentDid)}&filter=posts_with_replies&limit=1`;
                const res = await fetch(url);
                if (!res.ok) return null;
                const data = await res.json();
                const first = data.feed && data.feed[0] && data.feed[0].post;
                if (first && first.record && first.record.createdAt) {
                    return new Date(first.record.createdAt);
                }
                return null;
            } catch (e) {
                return null;
            }
        }

        async function fetchRecentActivityStats(days = 30) {
            const sinceDate = new Date(Date.now() - (days * 24 * 60 * 60 * 1000));
            const safe = (promise) => promise.catch(() => null);

            const [posts, likes, follows, reposts] = await Promise.all([
                safe(countRecentPostsSince(sinceDate, 5000)),
                safe(countRecentRecordsSince('app.bsky.feed.like', sinceDate, 5000)),
                safe(countRecentRecordsSince('app.bsky.graph.follow', sinceDate, 5000)),
                safe(countRecentRecordsSince('app.bsky.feed.repost', sinceDate, 5000))
            ]);

            return { days, posts, likes, follows, reposts };
        }

        async function countRecentPostsSince(sinceDate, maxFetch = 5000) {
            if (!currentDid) return null;
            let cursor = null;
            let scanned = 0;
            let count = 0;
            let reachedOlderRecords = false;
            const pageSize = 100;

            while (scanned < maxFetch) {
                let url = `${API_PUBLIC}/app.bsky.feed.getAuthorFeed?actor=${encodeURIComponent(currentDid)}&filter=posts_with_replies&limit=${pageSize}`;
                if (cursor) url += `&cursor=${encodeURIComponent(cursor)}`;
                const res = await fetch(url);
                if (!res.ok) return null;
                const data = await res.json();
                const feed = data.feed || [];
                if (feed.length === 0) break;

                for (const item of feed) {
                    const post = item && item.post ? item.post : null;
                    if (!post || !post.record || !post.record.createdAt) continue;
                    const createdAt = new Date(post.record.createdAt);
                    if (Number.isNaN(createdAt.getTime())) continue;
                    if (createdAt < sinceDate) {
                        reachedOlderRecords = true;
                        break;
                    }
                    const authorDid = post.author && post.author.did ? post.author.did : '';
                    if (authorDid && authorDid !== currentDid) continue;
                    count += 1;
                }

                scanned += feed.length;
                cursor = data.cursor || null;
                if (reachedOlderRecords || !cursor) break;
            }

            return {
                count,
                truncated: Boolean(cursor) && !reachedOlderRecords && scanned >= maxFetch
            };
        }

        async function countRecentRecordsSince(collection, sinceDate, maxFetch = 5000) {
            if (!currentDid || !currentPdsUrl) return null;
            let cursor = null;
            let scanned = 0;
            let count = 0;
            let reachedOlderRecords = false;
            let newestFirst = null;
            const pageSize = 100;

            while (scanned < maxFetch) {
                let url = `${currentPdsUrl}/xrpc/com.atproto.repo.listRecords?repo=${encodeURIComponent(currentDid)}&collection=${encodeURIComponent(collection)}&limit=${pageSize}&reverse=true`;
                if (cursor) url += `&cursor=${encodeURIComponent(cursor)}`;
                const res = await fetch(url);
                if (!res.ok) return null;
                const data = await res.json();
                const records = data.records || [];
                if (records.length === 0) break;

                if (newestFirst === null) {
                    const withDates = records
                        .map(record => (record && record.value && record.value.createdAt) ? new Date(record.value.createdAt) : null)
                        .filter(date => date && !Number.isNaN(date.getTime()));
                    if (withDates.length >= 2) {
                        newestFirst = withDates[0] >= withDates[withDates.length - 1];
                    }
                }

                for (const record of records) {
                    const createdAt = record && record.value && record.value.createdAt ? new Date(record.value.createdAt) : null;
                    if (!createdAt || Number.isNaN(createdAt.getTime())) continue;
                    if (createdAt < sinceDate) {
                        if (newestFirst === true) {
                            reachedOlderRecords = true;
                            break;
                        }
                        continue;
                    }
                    count += 1;
                }

                scanned += records.length;
                cursor = data.cursor || null;
                if ((newestFirst === true && reachedOlderRecords) || !cursor) break;
            }

            return {
                count,
                truncated: Boolean(cursor) && !reachedOlderRecords && scanned >= maxFetch
            };
        }

        function getQuoteHandle(post) {
            if (!post || !post.embed) return '';
            const recordView = getEmbeddedRecordView(post.embed);
            if (!recordView) return '';
            if (recordView.$type && recordView.$type !== 'app.bsky.embed.record#viewRecord') return '';
            const author = recordView.author;
            return author && author.handle ? author.handle : '';
        }

        function buildReplyPreview(reply) {
            if (!reply || !reply.parent) return '';
            const parent = reply.parent;
            const text = (parent.record && parent.record.text) ? parent.record.text : '';
            const snippet = text ? truncateText(text, 140) : '';
            return `
                <div class="reply-preview">
                    ${snippet ? `<div>${escapeHtml(snippet)}</div>` : `<div style="color:var(--text-soft);">No text preview</div>`}
                </div>
            `;
        }

        function buildQuotePreview(post) {
            if (!post || !post.embed) return '';
            const recordView = getEmbeddedRecordView(post.embed);
            if (!recordView) return '';
            if (recordView.$type && recordView.$type !== 'app.bsky.embed.record#viewRecord') return '';
            const author = recordView.author;
            const handle = author && author.handle ? `@${author.handle}` : 'unknown';
            const text = (recordView.value && recordView.value.text) ? recordView.value.text : '';
            const snippet = text ? truncateText(text, 140) : '';
            return `
                <div class="quote-preview">
                    ${snippet ? `<div>${escapeHtml(snippet)}</div>` : `<div style="color:var(--text-soft);">No text preview</div>`}
                </div>
            `;
        }

        function truncateText(text, maxLen) {
            if (!text) return '';
            if (text.length <= maxLen) return text;
            return text.slice(0, maxLen - 1) + '…';
        }

        function postHasLink(post) {
            if (!post || !post.record) return false;
            const text = post.record.text || '';
            if (/(https?:\/\/|www\.)/i.test(text)) return true;
            const facets = post.record.facets || [];
            for (const facet of facets) {
                const features = facet.features || [];
                for (const feature of features) {
                    if (feature.$type === 'app.bsky.richtext.facet#link') {
                        return true;
                    }
                }
            }
            return false;
        }

        function toggleClearButton(input) {
            const wrapper = input && input.parentElement;
            const button = wrapper ? wrapper.querySelector('.clear-input') : null;
            if (!button) return;
            if (input.value && input.value.trim()) {
                button.classList.add('show');
            } else {
                button.classList.remove('show');
            }
        }

        function authorMatches(item, predicate) {
            const values = [];
            const postAuthor = item.post && item.post.author ? item.post.author : null;
            if (postAuthor) {
                if (postAuthor.did) values.push(postAuthor.did.toLowerCase());
                if (postAuthor.handle) values.push(postAuthor.handle.toLowerCase());
                if (postAuthor.displayName) values.push(postAuthor.displayName.toLowerCase());
            }

            const replyAuthor = item.reply && item.reply.parent && item.reply.parent.author ? item.reply.parent.author : null;
            if (replyAuthor) {
                if (replyAuthor.did) values.push(replyAuthor.did.toLowerCase());
                if (replyAuthor.handle) values.push(replyAuthor.handle.toLowerCase());
                if (replyAuthor.displayName) values.push(replyAuthor.displayName.toLowerCase());
            }

            const quoteAuthor = getQuoteAuthor(item.post);
            if (quoteAuthor) {
                if (quoteAuthor.did) values.push(quoteAuthor.did.toLowerCase());
                if (quoteAuthor.handle) values.push(quoteAuthor.handle.toLowerCase());
                if (quoteAuthor.displayName) values.push(quoteAuthor.displayName.toLowerCase());
            }

            return values.some(value => predicate(value));
        }

        function getQuoteAuthor(post) {
            if (!post || !post.embed) return null;
            const recordView = getEmbeddedRecordView(post.embed);
            if (!recordView) return null;
            if (recordView.$type && recordView.$type !== 'app.bsky.embed.record#viewRecord') return null;
            return recordView.author || null;
        }

        function formatProfileDescription(profile) {
            const text = profile && typeof profile.description === 'string' ? profile.description : '';
            if (!text) return '';
            const facets = Array.isArray(profile.descriptionFacets) ? profile.descriptionFacets.slice() : [];
            const html = facets.length ? applyFacets(text, facets) : linkifyPlainTextUrls(text);
            return html.replace(/\n/g, '<br>');
        }

        function linkifyPlainTextUrls(text, options = {}) {
            const escaped = escapeHtml(text || '');
            const stopPropagation = Boolean(options.stopPropagation);
            const clickAttr = stopPropagation ? ' onclick="event.stopPropagation()"' : '';
            const urlPattern = /((?:https?:\/\/|www\.)[^\s<]+|(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}(?:\/[^\s<]*)?)/gi;
            return escaped.replace(urlPattern, (match, _group, offset, fullText) => {
                if (offset > 0 && fullText[offset - 1] === '@') return match;

                let url = match;
                let trailing = '';
                while (url && /[.,!?;:)]$/.test(url)) {
                    trailing = url.slice(-1) + trailing;
                    url = url.slice(0, -1);
                }
                if (!url) return match;

                const hasProtocol = /^https?:\/\//i.test(url);
                const href = hasProtocol ? url : `https://${url}`;
                return `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer"${clickAttr}>${url}</a>${trailing}`;
            });
        }

        function applyFacets(text, facets) {
            const sorted = facets.sort((a, b) => a.index.byteStart - b.index.byteStart);
            const byteIndexMap = buildByteIndexMap(text);
            
            let result = '';
            let lastByte = 0;
            
            sorted.forEach(facet => {
                const startByte = facet.index.byteStart;
                const endByte = facet.index.byteEnd;
                const start = byteIndexMap[startByte] ?? 0;
                const end = byteIndexMap[endByte] ?? text.length;
                
                result += linkifyPlainTextUrls(
                    text.substring(byteIndexMap[lastByte] ?? 0, start),
                    { stopPropagation: true }
                );
                
                const facetText = text.substring(start, end);
                const feature = Array.isArray(facet.features) ? facet.features[0] : null;
                
                if (feature && feature.$type === 'app.bsky.richtext.facet#link') {
                    result += `<a href="${escapeHtml(feature.uri)}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()">${escapeHtml(facetText)}</a>`;
                } else if (feature && feature.$type === 'app.bsky.richtext.facet#mention') {
                    result += `<a href="https://bsky.app/profile/${escapeHtml(feature.did)}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()">${escapeHtml(facetText)}</a>`;
                } else {
                    result += linkifyPlainTextUrls(facetText, { stopPropagation: true });
                }
                
                lastByte = endByte;
            });
            
            result += linkifyPlainTextUrls(
                text.substring(byteIndexMap[lastByte] ?? 0),
                { stopPropagation: true }
            );
            
            return result;
        }

        function buildByteIndexMap(text) {
            const encoder = new TextEncoder();
            const map = {};
            let bytePos = 0;
            let charIndex = 0;
            for (const char of text) {
                map[bytePos] = charIndex;
                const bytes = encoder.encode(char);
                bytePos += bytes.length;
                charIndex += char.length;
            }
            map[bytePos] = charIndex;
            return map;
        }

        function applyHighlights(htmlText, highlight) {
            if (!highlight) return htmlText;
            if (highlight.regex) {
                try {
                    const regex = highlight.regex;
                    return htmlText.replace(regex, (match) => `<span class="highlight">${escapeHtml(match)}</span>`);
                } catch (e) {
                    return htmlText;
                }
            }
            if (highlight.keywords && highlight.keywords.length) {
                let out = htmlText;
                highlight.keywords.forEach(word => {
                    const safe = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    const re = new RegExp(safe, 'ig');
                    out = out.replace(re, (match) => `<span class="highlight">${match}</span>`);
                });
                return out;
            }
            return htmlText;
        }

        function parseSearchRegex(raw, invalidMessage) {
            if (!raw.startsWith('/') || raw.lastIndexOf('/') <= 0) return null;

            const lastSlash = raw.lastIndexOf('/');
            const pattern = raw.slice(1, lastSlash);
            const rawFlags = raw.slice(lastSlash + 1) || 'i';
            // Remove stateful flags so repeated test() calls stay deterministic.
            const flags = rawFlags.replace(/[gy]/g, '');

            try {
                return new RegExp(pattern, flags || 'i');
            } catch (e) {
                showError(invalidMessage);
                return null;
            }
        }

        async function loadMore() {
            if (isLoading || !currentCursor) return;
            
            setLoading(true);
            
            try {
                if (currentMode === 'posts') {
                    await loadPosts(true);
                } else {
                    await loadLikes(true);
                }
                if (hasExpensiveFilters()) {
                    const dateRangeTarget = getAnalyticsTargetStartDate('custom');
                    const needsMoreForFilters = dateRangeTarget
                        ? !isLoadedThroughDate(dateRangeTarget)
                        : !allPostsLoaded;
                    if (needsMoreForFilters && currentCursor) {
                        elements.filterBanner.classList.add('show');
                    } else {
                        elements.filterBanner.classList.remove('show');
                    }
                    applyFiltersImmediate();
                }
            } finally {
                setLoading(false);
            }
        }

        function updateCoverageHint() {
            if (!elements.coverageHint) return;

            const shouldShow = Boolean(
                currentDid &&
                elements.contentSection.style.display !== 'none' &&
                (analyticsExpanded || hasExpensiveFilters())
            );
            if (!shouldShow) {
                elements.coverageHint.classList.remove('show');
                elements.coverageHint.innerHTML = '';
                return;
            }

            const isComplete = allPostsLoaded || !currentCursor;
            const unitLabel = currentMode === 'likes' ? 'likes' : 'items';
            const loadedCount = formatNumber(allPosts.length || 0);
            const coverageTarget = (elements.dateFrom.value || elements.dateTo.value)
                ? getAnalyticsTargetStartDate('custom')
                : (analyticsExpanded ? getAnalyticsTargetStartDate(analyticsRangePreset) : null);
            const rangeCovered = Boolean(coverageTarget && isLoadedThroughDate(coverageTarget));

            if (isComplete || rangeCovered) {
                elements.coverageHint.innerHTML = `
                    <span class="coverage-text is-complete">${isComplete
                        ? 'Complete loaded set for current analytics and filters.'
                        : 'Loaded set fully covers the selected time range.'}</span>
                `;
                elements.coverageHint.classList.add('show');
                setAnalyticsExpanded(analyticsExpanded);
                return;
            }

            elements.coverageHint.innerHTML = `
                <span class="coverage-text is-partial">Loaded ${loadedCount} ${unitLabel} so far. Older results may still be missing for analytics and filters. Use a shorter range, Load more, or Load all data.</span>
                <button class="coverage-load-btn" type="button" id="coverageLoadAllBtn">Load all data</button>
            `;
            elements.coverageHint.classList.add('show');
            setAnalyticsExpanded(analyticsExpanded);

            const loadBtn = document.getElementById('coverageLoadAllBtn');
            if (loadBtn) {
                loadBtn.addEventListener('click', async () => {
                    await loadAllPosts();
                    if (hasExpensiveFilters()) {
                        applyFiltersImmediate();
                    } else {
                        rerenderCurrentView();
                    }
                    updateCoverageHint();
                });
            }
        }

        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        function formatNumber(num) {
            return num.toString();
        }

        function formatEuDate(date) {
            const day = String(date.getDate()).padStart(2, '0');
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const year = date.getFullYear();
            return `${day}/${month}/${year}`;
        }

        function parseDateValue(value) {
            if (!value) return null;
            const parsed = new Date(value);
            if (Number.isNaN(parsed.getTime())) return null;
            return parsed;
        }

        function formatPdsLabel(url) {
            if (!url) return '—';
            try {
                const parsed = new URL(url);
                return parsed.host || url;
            } catch (e) {
                return url;
            }
        }

    
