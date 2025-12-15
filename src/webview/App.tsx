import React, { useState, useEffect, useCallback, useRef } from 'react';
import { SymbolItem, SymbolMode, WebviewMessage, Message } from '../shared/types';
import SymbolTree from './features/symbol/SymbolTree';
import './style.css';

// Acquire VS Code API
const vscode = acquireVsCodeApi();

const App: React.FC = () => {
    const savedState = vscode.getState() || {};
    const [mode, setMode] = useState<SymbolMode>(savedState.mode || 'current');
    const searchInputRef = useRef<any>(null);
    const [query, setQuery] = useState(savedState.query || '');
    const [symbols, setSymbols] = useState<SymbolItem[]>(savedState.symbols || []);
    const [totalCount, setTotalCount] = useState<number>(savedState.totalCount || 0);
    const [hasResults, setHasResults] = useState<boolean>(savedState.hasResults || false);
    const [selectedSymbol, setSelectedSymbol] = useState<SymbolItem | null>(null);
    const [isSearching, setIsSearching] = useState(false);
    const [backendStatus, setBackendStatus] = useState<'ready' | 'loading' | 'timeout'>(
        (savedState.mode || 'current') === 'project' ? 'loading' : 'ready'
    );
    const [enableDeepSearch, setEnableDeepSearch] = useState(false);
    const [scopePath, setScopePath] = useState<string | undefined>(undefined);
    const [includePattern, setIncludePattern] = useState(savedState.includePattern || '');
    const [showDetails, setShowDetails] = useState(savedState.showDetails || false);
    const [indexingProgress, setIndexingProgress] = useState<number | null>(null);
    const [isDatabaseMode, setIsDatabaseMode] = useState(savedState.isDatabaseMode || false);

    // Refs for accessing state in event listener
    const modeRef = useRef(mode);
    const queryRef = useRef(query);
    const includePatternRef = useRef(includePattern);
    const symbolsRef = useRef(symbols);
    const lastSearchQueryRef = useRef<string>(savedState.lastSearchQuery || savedState.query || '');
    const lastSearchPatternRef = useRef<string>(savedState.lastSearchPattern || savedState.includePattern || '');

    useEffect(() => { modeRef.current = mode; }, [mode]);
    useEffect(() => { queryRef.current = query; }, [query]);
    useEffect(() => { includePatternRef.current = includePattern; }, [includePattern]);
    useEffect(() => { symbolsRef.current = symbols; }, [symbols]);

    // Save state
    useEffect(() => {
        vscode.setState({ 
            mode, 
            query, 
            showDetails, 
            includePattern, 
            isDatabaseMode,
            symbols,
            totalCount,
            hasResults,
            lastSearchQuery: lastSearchQueryRef.current,
            lastSearchPattern: lastSearchPatternRef.current
        });
    }, [mode, query, showDetails, includePattern, isDatabaseMode, symbols, totalCount, hasResults]);

    // Handle messages from extension
    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            const message = event.data as Message;
            switch (message.command) {
                case 'updateSymbols':
                    setSymbols(message.symbols);
                    if (message.totalCount !== undefined) {
                        setTotalCount(message.totalCount);
                    }
                    setHasResults(message.symbols.length > 0);
                    setIsSearching(false);
                    break;
                case 'searchStart':
                    setIsSearching(true);
                    break;
                case 'setMode':
                    // Only clear if mode actually changes
                    if (modeRef.current !== message.mode) {
                        setMode(message.mode);
                        setQuery(''); // Clear query on mode toggle
                        setSymbols([]);
                        setHasResults(false);
                        lastSearchQueryRef.current = '';
                        lastSearchPatternRef.current = '';
                        // Don't auto-set status here, rely on backend 'status' message
                    }
                    break;
                case 'status':
                    setBackendStatus(message.status);
                    break;
                case 'setQuery':
                    setQuery(message.query);
                    break;
                case 'setSettings':
                    if (message.settings?.enableDeepSearch !== undefined) {
                        setEnableDeepSearch(message.settings.enableDeepSearch);
                    }
                    break;
                case 'refresh':
                    if (modeRef.current === 'project') {
                        // Only re-trigger search if:
                        // 1. Query or pattern has changed since last search, OR
                        // 2. No symbols exist yet (initial load)
                        const queryChanged = queryRef.current !== lastSearchQueryRef.current;
                        const patternChanged = includePatternRef.current !== lastSearchPatternRef.current;
                        const hasNoResults = symbolsRef.current.length === 0;
                        
                        if (queryChanged || patternChanged || hasNoResults) {
                            lastSearchQueryRef.current = queryRef.current;
                            lastSearchPatternRef.current = includePatternRef.current;
                            vscode.postMessage({ command: 'search', query: queryRef.current, includePattern: includePatternRef.current });
                        }
                        // Otherwise, keep existing results "sticky" - don't re-trigger search
                    }
                    break;
                case 'highlight':
                    // TODO: Implement highlight logic (expand tree and select)
                    break;
                case 'setScope':
                    setScopePath(message.scopePath);
                    break;
                case 'progress':
                    // @ts-ignore
                    setIndexingProgress(message.percent);
                    // @ts-ignore
                    if (message.percent >= 100) {
                        setIndexingProgress(null);
                    }
                    break;
                case 'setDatabaseMode':
                    // @ts-ignore
                    setIsDatabaseMode(message.enabled);
                    // If database mode is enabled, ensure we are in project mode if not already?
                    // No, user might be in current mode. But if in project mode, UI should update label.
                    if (message.enabled && modeRef.current === 'project') {
                        // Force re-render of title if needed, but React handles state change.
                    }
                    break;
                case 'appendSymbols':
                    // @ts-ignore
                    setSymbols(prev => [...prev, ...message.symbols]);
                    if (message.totalCount !== undefined) {
                        setTotalCount(message.totalCount);
                    }
                    setIsSearching(false);
                    break;
                case 'focusSearch':
                    // Focus the search input with retry mechanism
                    // This handles cases where the webview is still initializing
                    const attemptFocus = (retriesLeft = 10) => {
                        if (searchInputRef.current) {
                            // VSCodeTextField uses a shadow DOM, so we need to focus the internal input
                            const input = searchInputRef.current.shadowRoot?.querySelector('input');
                            if (input && !input.disabled) {
                                input.focus();
                                input.select(); // Also select any existing text
                            } else if (retriesLeft > 0) {
                                // Retry after a short delay if input not ready
                                setTimeout(() => attemptFocus(retriesLeft - 1), 50);
                            }
                        } else if (retriesLeft > 0) {
                            // Retry if ref not yet set
                            setTimeout(() => attemptFocus(retriesLeft - 1), 50);
                        }
                    };
                    attemptFocus();
                    break;
            }
        };

        window.addEventListener('message', handleMessage);
        
        // Notify extension that we are ready
        // Delay slightly to ensure state is fully initialized
        setTimeout(() => {
            // Only indicate hasSymbols if in project mode with query and we had results
            // This ensures sticky behavior only when we have actual search results to preserve
            const hasValidSymbols = mode === 'project' && query.length > 0 && hasResults;
            vscode.postMessage({ command: 'ready', hasSymbols: hasValidSymbols });
        }, 50);

        return () => window.removeEventListener('message', handleMessage);
    }, []);

    // Handle search input
    const handleSearch = (e: any) => {
        const newQuery = e.target.value;
        setQuery(newQuery);
        
        if (mode === 'project') {
            // Debounce is handled in backend or here? 
            // Spec says "Triggered only when the user types".
            // Let's send every keystroke and let backend debounce.
            lastSearchQueryRef.current = newQuery;
            vscode.postMessage({ command: 'search', query: newQuery, includePattern: includePatternRef.current });
        }
    };

    const handleIncludePatternChange = (e: any) => {
        const newPattern = e.target.value;
        setIncludePattern(newPattern);
        
        if (mode === 'project' && query) {
            lastSearchPatternRef.current = newPattern;
            vscode.postMessage({ command: 'search', query: query, includePattern: newPattern });
        }
    };

    const handleIncludePatternKeyDown = (e: any) => {
        if (e.key === 'Escape') {
            e.preventDefault();
            setIncludePattern('');
            if (mode === 'project' && query) {
                vscode.postMessage({ command: 'search', query: query, includePattern: '' });
            }
        }
    };

    // Handle jump
    const handleJump = (symbol: SymbolItem) => {
        vscode.postMessage({ 
            command: 'jump', 
            uri: symbol.uri, 
            range: symbol.selectionRange 
        });
    };

    // Handle selection
    const handleSelect = (symbol: SymbolItem) => {
        setSelectedSymbol(symbol);
        
        // Debug: Log to webview console
        console.log('[Webview] handleSelect called', { mode, symbolName: symbol.name, hasUri: !!symbol.uri, hasSelectionRange: !!symbol.selectionRange });
        
        // If in project mode (first window), log to debug console
        if (mode === 'project' && symbol.uri && symbol.selectionRange) {
            const lineNumber = symbol.selectionRange[0].line;
            console.log('[Webview] Sending logSelection message', { symbolName: symbol.name, uri: symbol.uri, line: lineNumber });
            vscode.postMessage({ 
                command: 'logSelection', 
                symbolName: symbol.name,
                uri: symbol.uri, 
                line: lineNumber
            });
        }
    };

    // Handle keyboard navigation
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Only handle navigation if not typing in an input (unless it's the search box and we want to support arrow keys there too)
            // Actually, usually we want arrow keys to work even if focused on search box to navigate the list.
            // But if the user is typing, ArrowLeft/Right should work in input. ArrowUp/Down usually navigate list.
            
            if (e.key === 'Escape') {
                // Clear search query if focused on search bar or generally if query exists
                if (queryRef.current.length > 0) {
                    e.preventDefault();
                    setQuery('');
                    vscode.postMessage({ command: 'search', query: '', includePattern: includePatternRef.current });
                }
                return;
            }

            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                const selectedEl = document.querySelector('.symbol-item.selected');
                const allItems = Array.from(document.querySelectorAll('.symbol-item'));
                
                if (allItems.length === 0) return;

                let nextIndex = 0;
                if (selectedEl) {
                    const currentIndex = allItems.indexOf(selectedEl);
                    if (e.key === 'ArrowDown') {
                        nextIndex = Math.min(currentIndex + 1, allItems.length - 1);
                    } else {
                        nextIndex = Math.max(currentIndex - 1, 0);
                    }
                } else {
                    // If nothing selected, select first
                    nextIndex = 0;
                }

                const nextEl = allItems[nextIndex] as HTMLElement;
                if (nextEl) {
                    nextEl.click();
                    nextEl.scrollIntoView({ block: 'nearest' });
                }
            } else if (e.key === 'Enter') {
                if (selectedSymbol) {
                    handleJump(selectedSymbol);
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedSymbol]);

    // Sort symbols by relevance (prefix match first, then alphabetically)
    const sortSymbolsByRelevance = useCallback((symbols: SymbolItem[], query: string): SymbolItem[] => {
        const lowerQuery = query.toLowerCase();
        const keywords = lowerQuery.split(/\s+/).filter((k: string) => k.length > 0);
        
        // If no query, sort alphabetically only
        if (keywords.length === 0) {
            return symbols.sort((a, b) => a.name.localeCompare(b.name));
        }
        
        // Calculate relevance score for each symbol
        const scoredSymbols = symbols.map(symbol => {
            const lowerName = symbol.name.toLowerCase();
            let score = 0;
            
            // Check how close the first letters match each keyword
            for (const keyword of keywords) {
                const index = lowerName.indexOf(keyword);
                if (index !== -1) {
                    // Lower index = better match (closer to start)
                    // Prefix match (index === 0) gets highest score
                    if (index === 0) {
                        score += 1000; // Prefix match bonus
                    } else {
                        // The closer to the start, the higher the score
                        score += Math.max(0, 100 - index);
                    }
                }
            }
            
            return { symbol, score };
        });
        
        // Sort by score (descending), then alphabetically by name
        return scoredSymbols
            .sort((a, b) => {
                if (b.score !== a.score) {
                    return b.score - a.score;
                }
                return a.symbol.name.localeCompare(b.symbol.name);
            })
            .map(item => item.symbol);
    }, []);

    // Filter symbols for Current Mode (Client-side)
    const displaySymbols = React.useMemo(() => {
        if (mode === 'project') {
            return symbols; // Backend handles filtering
        }
        
        if (!query) return symbols;

        const lowerQuery = query.toLowerCase();
        const keywords = lowerQuery.split(/\s+/).filter((k: string) => k.length > 0);

        const filterTree = (items: SymbolItem[]): SymbolItem[] => {
            const result: SymbolItem[] = [];
            for (const item of items) {
                const match = keywords.every((k: string) => item.name.toLowerCase().includes(k));
                
                if (match) {
                    // If parent matches, include it and ALL its original children (no filtering on children)
                    // This allows users to expand the result and see members
                    // We don't force expand here, so user sees the match but not necessarily all children immediately
                    result.push({
                        ...item,
                        autoExpand: false
                    });
                } else {
                    // If parent doesn't match, check children
                    const filteredChildren = item.children ? filterTree(item.children) : [];
                    
                    if (filteredChildren.length > 0) {
                        result.push({
                            ...item,
                            children: filteredChildren,
                            autoExpand: true // Force expand because a child matched
                        });
                    }
                }
            }
            return result;
        };

        const filtered = filterTree(symbols);
        // Sort the filtered results by relevance
        return sortSymbolsByRelevance(filtered, query);
    }, [symbols, query, mode, sortSymbolsByRelevance]);

    // Auto-load more if content doesn't fill container
    useEffect(() => {
        if (mode === 'project' && symbols.length > 0 && symbols.length < totalCount) {
            const container = document.querySelector('.tree-container');
            if (container && container.scrollHeight <= container.clientHeight) {
                vscode.postMessage({ command: 'loadMore' });
            }
        }
    }, [symbols, mode, totalCount]);

    // Handle scroll for infinite loading
    const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
        if (mode === 'project') {
            const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
            // If scrolled to bottom (within 20px)
            if (scrollTop + clientHeight >= scrollHeight - 20) {
                vscode.postMessage({ command: 'loadMore' });
            }
        }
    };

    return (
        <div className={`container mode-${mode} ${indexingProgress !== null ? 'has-progress' : ''}`}>
            {indexingProgress !== null && (
                <div className="indexing-progress-container">
                    <div className="indexing-label">
                        <span className="codicon codicon-sync codicon-modifier-spin"></span>
                        <span>Indexing Symbols... {indexingProgress}%</span>
                    </div>
                    <div className="indexing-progress">
                        {/* eslint-disable-next-line react/forbid-dom-props */}
                        <div className="indexing-progress-bar" style={{ width: `${indexingProgress}%` }} />
                    </div>
                </div>
            )}
            <div className="search-container">
                <div className="mode-indicator">
                    {mode === 'current' ? 'Current Document' : (isDatabaseMode ? 'Project Workspace (Database)' : 'Project Workspace')}
                </div>
                {backendStatus === 'loading' && (
                    <div className="status-warning">
                        <span className="codicon codicon-loading codicon-modifier-spin"></span>
                        {mode === 'project' && query ? 'Searching...' : 'Waiting for symbol provider...'}
                        {mode === 'project' && query && (
                            <span 
                                className="codicon codicon-close cancel-button" 
                                title="Cancel Search"
                                onClick={() => vscode.postMessage({ command: 'cancel' })}
                            ></span>
                        )}
                    </div>
                )}
                {backendStatus === 'timeout' && (
                    <div className="status-error">
                        <span className="codicon codicon-warning"></span>
                        Symbol provider not ready. Open a file to retry.
                    </div>
                )}
                <div className="search-input-wrapper">
                    <span className="codicon codicon-search search-icon"></span>
                    <input 
                        ref={searchInputRef}
                        type="text"
                        className="search-input"
                        placeholder={mode === 'current' ? "Filter symbols..." : "Search workspace..."}
                        value={query}
                        onInput={handleSearch}
                        disabled={backendStatus === 'loading' || backendStatus === 'timeout'}
                    />
                    {mode === 'project' && enableDeepSearch && !isDatabaseMode && (
                        <span 
                            className={`codicon codicon-kebab-vertical search-icon-end ${showDetails ? 'active' : ''}`}
                            onClick={() => setShowDetails(!showDetails)}
                            title="Toggle Search Details(DeepSearch)"
                        ></span>
                    )}
                </div>
                
                {mode === 'project' && enableDeepSearch && !isDatabaseMode && showDetails && (
                    <div className="search-details">
                        <div className="scope-control">
                            <span className="label">Scope:</span>
                            <span className="scope-path" title={scopePath || 'Workspace Root'}>
                                {scopePath ? scopePath.split(/[\\/]/).pop() : 'Workspace Root'}
                            </span>
                            <span 
                                className="codicon codicon-folder-opened action-icon" 
                                title="Select Folder"
                                onClick={() => vscode.postMessage({ command: 'selectScope' })}
                            ></span>
                            {scopePath && (
                                <span 
                                    className="codicon codicon-clear-all action-icon" 
                                    title="Clear Scope"
                                    onClick={() => vscode.postMessage({ command: 'clearScope' })}
                                ></span>
                            )}
                        </div>
                        <div className="include-pattern-container">
                            <span className="label">files to include</span>
                            <div className="search-input-wrapper">
                                <span className="codicon codicon-files search-icon"></span>
                                <input 
                                    type="text"
                                    className="search-input include-pattern-input"
                                    placeholder="e.g. *.ts, src/**/include"
                                    value={includePattern}
                                    onInput={handleIncludePatternChange}
                                    onKeyDown={handleIncludePatternKeyDown}
                                />
                            </div>
                        </div>
                    </div>
                )}
            </div>
            <div className="tree-container" onScroll={handleScroll}>
                {isSearching && <div className="loading-indicator">Searching...</div>}
                {!isSearching && displaySymbols.length === 0 && query.length > 0 && (
                    <div className="no-results">No results found</div>
                )}
                <SymbolTree 
                    symbols={displaySymbols} 
                    onJump={handleJump}
                    onSelect={handleSelect}
                    selectedSymbol={selectedSymbol}
                    defaultExpanded={mode === 'current' ? !!query : false}
                    searchQuery={query}
                />
            </div>
        </div>
    );
};

export default App;
