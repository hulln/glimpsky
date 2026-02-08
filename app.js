        const API_PUBLIC = 'https://public.api.bsky.app/xrpc';
        
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
        let latestFollowDate = null;
        let latestRepostDate = null;
        let accountInfoToken = 0;
        let joinedLoaded = false;
        let lastActiveLoaded = false;
        const likesCountCache = new Map();
        const mutualsCache = new Map();
        const blockingCountCache = new Map();

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
            error: document.getElementById('error'),
            sectionTitle: document.getElementById('sectionTitle'),
            listModal: document.getElementById('listModal'),
            listModalTitle: document.getElementById('listModalTitle'),
            listModalMeta: document.getElementById('listModalMeta'),
            listModalList: document.getElementById('listModalList'),
            listModalClose: document.getElementById('listModalClose'),
            listModalLoadMore: document.getElementById('listModalLoadMore'),
            infoModal: document.getElementById('infoModal'),
            infoBtn: document.getElementById('infoBtn'),
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
        elements.handleInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') loadContent('posts');
        });

        elements.handleInput.addEventListener('input', () => {
            queueHandleSuggestions(elements.handleInput.value);
        });

        elements.sortOldest.addEventListener('change', () => {
            handleFilterChange();
        });
        
        let filterInputTimer = null;
        elements.searchText.addEventListener('input', () => {
            if (filterInputTimer) clearTimeout(filterInputTimer);
            filterInputTimer = setTimeout(() => {
                handleFilterChange();
            }, 250);
        });

        elements.searchAuthor.addEventListener('input', () => {
            if (filterInputTimer) clearTimeout(filterInputTimer);
            filterInputTimer = setTimeout(() => {
                handleFilterChange();
            }, 250);
        });

        elements.dateFrom.addEventListener('change', () => {
            handleFilterChange();
        });

        elements.dateTo.addEventListener('change', () => {
            handleFilterChange();
        });

        elements.filterLoadBtn.addEventListener('click', async () => {
            await loadAllPosts();
            if (allPostsLoaded) {
                elements.filterBanner.classList.remove('show');
                applyFiltersImmediate();
            }
        });

        elements.filterCancelBtn.addEventListener('click', async () => {
            clearExpensiveFilters();
            elements.filterBanner.classList.remove('show');
            await resetToPagedView();
        });


        elements.advancedFiltersToggle.addEventListener('click', () => {
            elements.advancedFiltersToggle.classList.toggle('expanded');
            elements.advancedFiltersContent.classList.toggle('expanded');
        });

        elements.infoBtn.addEventListener('click', () => {
            elements.infoModal.classList.add('open');
            elements.infoModal.setAttribute('aria-hidden', 'false');
        });

        elements.infoModalClose.addEventListener('click', () => {
            elements.infoModal.classList.remove('open');
            elements.infoModal.setAttribute('aria-hidden', 'true');
        });

        function getToolHomeUrl() {
            const url = new URL(window.location.href);
            url.search = '';
            url.hash = '';
            return url.toString();
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
            const text = `Bluesky Profile Viewer ${url}`;
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
            elements.profileCard.style.display = 'none';
            elements.contentSection.style.display = 'none';
            elements.content.innerHTML = '';
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
            latestFollowDate = null;
            latestRepostDate = null;
            likesCountToken = 0;
            likesCountTruncated = false;
            likesCountExact = false;
            likesCountBusy = false;
            likesCountCache.clear();
            mutualsCache.clear();
            blockingCountCache.clear();
            joinedLoaded = false;
            lastActiveLoaded = false;
            elements.hideReposts.checked = true;
            elements.hideReplies.checked = false;
            elements.onlyLinks.checked = false;
            elements.hideQuotes.checked = false;
            elements.dateFrom.value = '';
            elements.dateTo.value = '';
            elements.searchText.value = '';
            elements.searchAuthor.value = '';
            elements.advancedFiltersContent.classList.remove('expanded');
            elements.advancedFiltersToggle.classList.remove('expanded');
            elements.filterBanner.classList.remove('show');
            elements.sortOldest.checked = false;
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
                const response = await fetch(`https://plc.directory/${did}`);
                if (!response.ok) {
                    throw new Error('Could not fetch DID document');
                }
                
                const didDoc = await response.json();
                currentDidDoc = didDoc;
                
                const pdsService = didDoc.service?.find(s => s.id === '#atproto_pds');
                if (!pdsService) {
                    throw new Error('No PDS service found in DID document');
                }
                
                return pdsService.serviceEndpoint;
            } catch (error) {
                throw new Error(`Failed to get PDS URL: ${error.message}`);
            }
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

            elements.profileCard.innerHTML = `
                <div class="profile-header">
                    <img src="${avatar}" alt="${escapeHtml(displayName)}" class="avatar">
                    <div class="profile-info">
                        <div class="profile-topline">
                            <h2>${escapeHtml(displayName)}</h2>
                            <a class="copy-link-btn" href="https://bsky.app/profile/${escapeHtml(profile.handle)}" target="_blank" rel="noopener noreferrer">Open in Bluesky</a>
                        </div>
                        <div class="handle">@${escapeHtml(profile.handle)}</div>
                        ${description ? `<div class="description">${escapeHtml(description)}</div>` : ''}
                        <div class="account-info">
                            <div class="account-item">
                                <span class="account-label">Joined</span>
                                <span id="joinedDate">—</span>
                            </div>
                            <div class="account-item">
                                <span class="account-label">Last active</span>
                                <span id="lastActiveDate">—</span>
                            </div>
                            <div class="account-item">
                                <span class="account-label">Last follow</span>
                                <span id="lastFollowDate">—</span>
                            </div>
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

        function openListModal(title, note, loader) {
            listCursor = null;
            listLoader = loader;
            listLoading = false;
            listNote = note || '';
            elements.listModalTitle.textContent = title;
            elements.listModalMeta.textContent = listNote;
            elements.listModalMeta.style.display = listNote ? 'block' : 'none';
            elements.listModalList.innerHTML = '';
            elements.listModalLoadMore.style.display = 'none';
            elements.listModal.classList.add('open');
            elements.listModal.setAttribute('aria-hidden', 'false');
            loadMoreList();
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
        }

        async function loadMoreList() {
            if (!listLoader || listLoading) return;
            listLoading = true;
            elements.listModalLoadMore.disabled = true;
            elements.listModalLoadMore.textContent = 'Loading…';
            try {
                const res = await listLoader(listCursor);
                const profiles = res?.profiles || [];
                renderProfileListItems(profiles);
                listCursor = res?.cursor || null;
                elements.listModalLoadMore.style.display = listCursor ? 'inline-flex' : 'none';
            } catch (e) {
                const msg = (e && e.message) ? e.message : String(e);
                elements.listModalList.insertAdjacentHTML('beforeend', `
                    <div class="empty-state" style="padding: 16px 10px;">
                        <p>Failed to load list</p>
                        <p style="font-size: 13px; margin-top: 8px; color: #94a3b8;">${escapeHtml(msg)}</p>
                    </div>
                `);
                elements.listModalLoadMore.style.display = 'none';
            } finally {
                listLoading = false;
                elements.listModalLoadMore.disabled = false;
                elements.listModalLoadMore.textContent = 'Load more';
            }
        }

        function renderProfileListItems(profiles) {
            if (!profiles || profiles.length === 0) {
                if (!elements.listModalList.children.length) {
                    elements.listModalList.innerHTML = `
                        <div class="empty-state" style="padding: 16px 10px;">
                            <p>Nothing here</p>
                        </div>
                    `;
                }
                return;
            }

            const html = profiles.map(p => {
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

            elements.listModalList.insertAdjacentHTML('beforeend', html);

            [...elements.listModalList.querySelectorAll('.list-item')].slice(-profiles.length).forEach(el => {
                el.addEventListener('click', async () => {
                    const actor = el.getAttribute('data-actor');
                    closeListModal();
                    if (actor) {
                        elements.handleInput.value = actor;
                        await loadContent(currentMode);
                    }
                });
            });
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
                makeStaticPager([])
            );
            elements.listModalMeta.style.display = 'none';
            elements.listModalLoadMore.style.display = 'none';
            elements.listModalList.innerHTML = `
                <div class="empty-state" style="padding: 16px 10px;">
                    <p>Feature unavailable</p>
                    <p style="font-size: 13px; margin-top: 8px; color: #94a3b8;">
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

        function updateUrlParams(handle, mode) {
            const params = new URLSearchParams();
            if (handle) params.set('handle', handle);
            if (mode) params.set('mode', mode);
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
            if (!handle) return;
            elements.handleInput.value = handle;
            loadContent(mode);
        }

        function loadFromStorage() {
            const handle = localStorage.getItem('lastHandle');
            const mode = localStorage.getItem('lastMode') === 'likes' ? 'likes' : 'posts';
            if (!handle) return;
            elements.handleInput.value = handle;
            loadContent(mode);
        }

        elements.listModalClose.addEventListener('click', closeListModal);
        elements.listModalLoadMore.addEventListener('click', loadMoreList);
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
            updateModeButtons('posts');
            const homeUrl = getToolHomeUrl();
            window.history.replaceState({}, '', homeUrl);
        });

        async function updateAccountInfo(force = false) {
            const joinedEl = document.getElementById('joinedDate');
            const lastActiveEl = document.getElementById('lastActiveDate');
            const lastFollowEl = document.getElementById('lastFollowDate');
            if (!joinedEl || !lastActiveEl || !lastFollowEl) return;

            const token = ++accountInfoToken;

            if (!joinedDate && !joinedLoaded) {
                joinedDate = await fetchJoinedDate();
                joinedLoaded = Boolean(joinedDate);
            }
            if (token !== accountInfoToken) return;
            joinedEl.textContent = joinedDate ? formatEuDate(joinedDate) : '—';

            if (lastActiveLoaded && !force) {
                lastActiveEl.textContent = (latestPostDate || latestLikeDate || latestFollowDate || latestRepostDate)
                    ? formatEuDate(getLatestActivityDate())
                    : '—';
                lastFollowEl.textContent = latestFollowDate ? formatEuDate(latestFollowDate) : '—';
                return;
            }

            lastActiveEl.textContent = '…';
            lastFollowEl.textContent = latestFollowDate ? formatEuDate(latestFollowDate) : '—';

            if (currentDid && currentPdsUrl) {
                try {
                    const [postDate, likeDate, followDate, repostDate] = await Promise.all([
                        fetchLatestPostDate(),
                        fetchLatestRecordDate('app.bsky.feed.like'),
                        fetchLatestRecordDate('app.bsky.graph.follow'),
                        fetchLatestRecordDate('app.bsky.feed.repost')
                    ]);

                    if (token !== accountInfoToken) return;

                    latestPostDate = postDate || latestPostDate;
                    latestLikeDate = likeDate || latestLikeDate;
                    latestFollowDate = followDate || latestFollowDate;
                    latestRepostDate = repostDate || latestRepostDate;

                    let latestFinal = latestPostDate || null;
                    if (latestLikeDate && (!latestFinal || latestLikeDate > latestFinal)) latestFinal = latestLikeDate;
                    if (latestFollowDate && (!latestFinal || latestFollowDate > latestFinal)) latestFinal = latestFollowDate;
                    if (latestRepostDate && (!latestFinal || latestRepostDate > latestFinal)) latestFinal = latestRepostDate;

                    lastActiveEl.textContent = latestFinal ? formatEuDate(latestFinal) : '—';
                    lastFollowEl.textContent = latestFollowDate ? formatEuDate(latestFollowDate) : '—';
                    lastActiveLoaded = true;
                } catch (e) {
                    if (token !== accountInfoToken) return;
                    lastActiveEl.textContent = latestPostDate ? formatEuDate(latestPostDate) : '—';
                    lastFollowEl.textContent = latestFollowDate ? formatEuDate(latestFollowDate) : '—';
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
                elements.loadMoreContainer.style.display = 'none';
                updateLikesCount();
                
                statusDiv.className = 'success-message';
                statusDiv.textContent = `Successfully loaded all ${allPosts.length} ${contentType}`;
                
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
                if (!response.ok) break;

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
                if (!response.ok) break;

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

                const token = ++likesCountToken;
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
        }

        async function handleFilterChange() {
            if (!currentDid) return;
            if (hasExpensiveFilters()) {
                if (allPostsLoaded) {
                    elements.filterBanner.classList.remove('show');
                    applyFiltersImmediate();
                } else {
                    elements.filterBanner.classList.add('show');
                }
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
                let regex = null;
                if (raw.startsWith('/') && raw.lastIndexOf('/') > 0) {
                    const lastSlash = raw.lastIndexOf('/');
                    const pattern = raw.slice(1, lastSlash);
                    const flags = raw.slice(lastSlash + 1) || 'i';
                    try {
                        regex = new RegExp(pattern, flags);
                    } catch (e) {
                        showError('Invalid regex pattern. Falling back to keyword search.');
                    }
                }

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
                let regex = null;
                if (raw.startsWith('/') && raw.lastIndexOf('/') > 0) {
                    const lastSlash = raw.lastIndexOf('/');
                    const pattern = raw.slice(1, lastSlash);
                    const flags = raw.slice(lastSlash + 1) || 'i';
                    try {
                        regex = new RegExp(pattern, flags);
                    } catch (e) {
                        showError('Invalid regex pattern in author search. Falling back to keyword search.');
                    }
                }

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
                        <p style="font-size: 13px; margin-top: 8px; color: #94a3b8;">
                            ${hasDateFilter ? 'Date range: ' + (elements.dateFrom.value || 'any') + ' to ' + (elements.dateTo.value || 'any') : ''}
                            ${hasTextFilter ? (hasDateFilter ? '<br>' : '') + 'Search: "' + escapeHtml(hasTextFilter) + '"' : ''}
                            ${hasAuthorFilter ? ((hasDateFilter || hasTextFilter) ? '<br>' : '') + 'Author: "' + escapeHtml(hasAuthorFilter) + '"' : ''}
                        </p>
                    </div>
                `;
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
                    infoDiv.textContent = `Showing ${filtered.length} of ${allPosts.length} ${currentMode}`;
                }
                elements.content.insertBefore(infoDiv, elements.content.firstChild);
            }
        }

        function updateModeButtons(mode) {
            const isLikes = mode === 'likes';
            elements.loadPostsBtn.classList.toggle('active', !isLikes);
            elements.loadLikesBtn.classList.toggle('active', isLikes);
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
                    latestFollowDate = null;
                    latestRepostDate = null;
                    joinedLoaded = false;
                    lastActiveLoaded = false;
                    likesCountCache.clear();
                    mutualsCache.clear();
                    blockingCountCache.clear();
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
                updateUrlParams(currentHandle, currentMode);

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
                if (hasExpensiveFilters()) {
                    handleFilterChange();
                }
            } catch (error) {
                showError(error.message, true);
                elements.profileCard.style.display = 'none';
                elements.contentSection.style.display = 'none';
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
                elements.loadMoreContainer.style.display = currentCursor ? 'block' : 'none';
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
                    elements.loadMoreContainer.style.display = 'none';
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
                elements.loadMoreContainer.style.display = currentCursor ? 'block' : 'none';
            } catch (error) {
                showError(error.message);
                if (!append) {
                    elements.content.innerHTML = `
                        <div class="empty-state">
                            <p>Failed to load likes</p>
                            <p style="font-size: 13px; margin-top: 8px; color: #94a3b8;">${escapeHtml(error.message)}</p>
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
                    if (response.ok) {
                        const data = await response.json();
                        allPosts.push(...(data.posts || []));
                    }
                }
                
                return allPosts;
            } catch (error) {
                console.error('Error fetching posts:', error);
                return [];
            }
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
                return;
            }

            const likeTimestamps = {};
            likeRecords.forEach(record => {
                likeTimestamps[record.value.subject.uri] = new Date(record.value.createdAt);
            });

            if (elements.hideQuotes.checked) {
                posts = posts.filter(post => !isQuotePost(post));
            }

            posts.sort((a, b) => {
                const timeA = likeTimestamps[a.uri] || new Date(0);
                const timeB = likeTimestamps[b.uri] || new Date(0);
                return elements.sortOldest.checked ? (timeA - timeB) : (timeB - timeA);
            });

            posts.forEach((post, idx) => {
                const highlight = Array.isArray(highlights) ? highlights[idx] : null;
                const reply = post && post.reply ? post.reply : null;
                const postDiv = createPostElement(post, null, reply, highlight);
                elements.content.appendChild(postDiv);
            });
        }

        function displayPosts(feed, append = false) {
            const hideReposts = elements.hideReposts.checked;
            const hideQuotes = elements.hideQuotes.checked;
            const onlyLinks = elements.onlyLinks.checked;
            
            let filteredFeed = feed;
            if (hideReposts) {
                filteredFeed = feed.filter(item => {
                    return !item.reason || item.reason.$type !== 'app.bsky.feed.defs#reasonRepost';
                });
            }
            if (hideQuotes) {
                filteredFeed = filteredFeed.filter(item => !isQuotePost(item.post));
            }
            if (onlyLinks) {
                filteredFeed = filteredFeed.filter(item => {
                    const isRepost = Boolean(item.reason && item.reason.$type === 'app.bsky.feed.defs#reasonRepost');
                    if (isRepost) return false;
                    return postHasLink(item.post);
                });
            }

            if (!append) {
                elements.content.innerHTML = '';
            }

            if (filteredFeed.length === 0 && !append) {
                elements.content.innerHTML = `
                    <div class="empty-state">
                        <p>No ${currentMode} found</p>
                    </div>
                `;
                return;
            }

            if (elements.sortOldest.checked) {
                filteredFeed = [...filteredFeed].sort((a, b) => {
                    const timeA = new Date(a.post?.record?.createdAt || 0);
                    const timeB = new Date(b.post?.record?.createdAt || 0);
                    return timeA - timeB;
                });
            }

            filteredFeed.forEach(item => {
                const post = item.post;
                const postDiv = createPostElement(post, item.reason, item.reply, item._highlight || null);
                elements.content.appendChild(postDiv);
            });
        }

        function createPostElement(post, reason, reply, highlight) {
            const div = document.createElement('div');
            div.className = 'post';
            
            const author = post.author;
            const record = post.record;
            const avatar = author.avatar || 'https://via.placeholder.com/40';
            
            const timestamp = new Date(record.createdAt);
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
                    ${snippet ? `<div>${escapeHtml(snippet)}</div>` : `<div style="color:#94a3b8;">No text preview</div>`}
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
                    ${snippet ? `<div>${escapeHtml(snippet)}</div>` : `<div style="color:#94a3b8;">No text preview</div>`}
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

        function authorMatches(item, predicate) {
            const values = [];
            const postAuthor = item.post && item.post.author ? item.post.author : null;
            if (postAuthor) {
                if (postAuthor.handle) values.push(postAuthor.handle.toLowerCase());
                if (postAuthor.displayName) values.push(postAuthor.displayName.toLowerCase());
            }

            const replyAuthor = item.reply && item.reply.parent && item.reply.parent.author ? item.reply.parent.author : null;
            if (replyAuthor) {
                if (replyAuthor.handle) values.push(replyAuthor.handle.toLowerCase());
                if (replyAuthor.displayName) values.push(replyAuthor.displayName.toLowerCase());
            }

            const quoteAuthor = getQuoteAuthor(item.post);
            if (quoteAuthor) {
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
                
                result += escapeHtml(text.substring(byteIndexMap[lastByte] ?? 0, start));
                
                const facetText = text.substring(start, end);
                const feature = facet.features[0];
                
                if (feature.$type === 'app.bsky.richtext.facet#link') {
                    result += `<a href="${escapeHtml(feature.uri)}" target="_blank" onclick="event.stopPropagation()">${escapeHtml(facetText)}</a>`;
                } else if (feature.$type === 'app.bsky.richtext.facet#mention') {
                    result += `<a href="https://bsky.app/profile/${escapeHtml(feature.did)}" target="_blank" onclick="event.stopPropagation()">${escapeHtml(facetText)}</a>`;
                } else {
                    result += escapeHtml(facetText);
                }
                
                lastByte = endByte;
            });
            
            result += escapeHtml(text.substring(byteIndexMap[lastByte] ?? 0));
            
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

        async function loadMore() {
            if (isLoading || !currentCursor) return;
            
            setLoading(true);
            
            try {
                if (currentMode === 'posts') {
                    await loadPosts(true);
                } else {
                    await loadLikes(true);
                }
            } finally {
                setLoading(false);
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

    
