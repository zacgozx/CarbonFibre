/* ============================================================
   Obsidian plugins 2/5: the UI pieces plugins build with: icons, Notice, Modal, the suggestion
   pickers, Menu and Setting with its controls. Same class names as Obsidian, so plugin
   stylesheets keep working; css/26-plugins.css styles them in CarbonFibre's colours.
   ============================================================ */

/* ---- icons: a Lucide-style set drawn on a 24px grid; plugins can add their own with addIcon ---- */
const PluginIcons = {
  custom: {},
  paths: {
    "plus": "M12 5v14M5 12h14", "minus": "M5 12h14", "x": "M18 6 6 18M6 6l12 12", "check": "M20 6 9 17l-5-5",
    "chevron-right": "m9 18 6-6-6-6", "chevron-left": "m15 18-6-6 6-6", "chevron-down": "m6 9 6 6 6-6", "chevron-up": "m18 15-6-6-6 6",
    "arrow-right": "M5 12h14M12 5l7 7-7 7", "arrow-left": "M19 12H5M12 19l-7-7 7-7", "arrow-up": "M12 19V5M5 12l7-7 7 7", "arrow-down": "M12 5v14M19 12l-7 7-7-7",
    "arrow-up-down": "m21 16-4 4-4-4M17 20V4M3 8l4-4 4 4M7 4v16",
    "search": "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-4.3-4.3", "settings": "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z",
    "file": "M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6", "file-text": "M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6M8 13h8M8 17h6",
    "file-plus": "M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6M12 12v6M9 15h6",
    "folder": "M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2z", "folder-open": "M6 14l1.5-3A2 2 0 0 1 9.3 10H20a2 2 0 0 1 1.9 2.5l-1.5 6A2 2 0 0 1 18.5 20H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v3",
    "trash": "M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6", "pencil": "M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z", "copy": "M8 8h12v12H8zM4 16V4h12",
    "clipboard": "M9 2h6v4H9zM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2", "link": "M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7",
    "external-link": "M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6",
    "calendar": "M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM16 2v4M8 2v4M3 10h18", "calendar-days": "M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM16 2v4M8 2v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01",
    "clock": "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 3", "bell": "M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.9 1.9 0 0 0 3.4 0",
    "star": "m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z", "heart": "M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7z",
    "bookmark": "m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z", "tag": "M12 2H2v10l9.3 9.3a2.4 2.4 0 0 0 3.4 0l6.6-6.6a2.4 2.4 0 0 0 0-3.4zM7 7h.01", "hash": "M4 9h16M4 15h16M10 3 8 21M16 3l-2 18",
    "list": "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01", "list-checks": "m3 17 2 2 4-4M3 7l2 2 4-4M13 6h8M13 12h8M13 18h8", "list-ordered": "M10 6h11M10 12h11M10 18h11M4 6h1v4M4 10h2M6 18H4c0-1 2-2 2-3s-1-1.5-2-1",
    "info": "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 16v-4M12 8h.01", "help-circle": "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01",
    "alert-triangle": "m21.7 18-8-14a2 2 0 0 0-3.4 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3zM12 9v4M12 17h.01", "alert-circle": "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 8v4M12 16h.01",
    "refresh-cw": "M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5M21 12a9 9 0 0 1-15 6.7L3 16M8 16H3v5", "rotate-ccw": "M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5",
    "upload": "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12", "download": "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3",
    "image": "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM9 7a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM21 15l-5-5L5 21",
    "eye": "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z", "eye-off": "M9.9 4.2A10 10 0 0 1 12 4c6.5 0 10 7 10 7a17 17 0 0 1-2.2 3.2M6.6 6.6A17 17 0 0 0 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6M2 2l20 20M9.9 9.9a3 3 0 0 0 4.2 4.2",
    "lock": "M5 11h14v10H5zM7 11V7a5 5 0 0 1 10 0v4", "unlock": "M5 11h14v10H5zM7 11V7a5 5 0 0 1 9.9-1",
    "more-horizontal": "M12 12h.01M19 12h.01M5 12h.01", "more-vertical": "M12 12h.01M12 5h.01M12 19h.01", "menu": "M4 6h16M4 12h16M4 18h16",
    "layout-dashboard": "M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z", "table": "M3 3h18v18H3zM3 9h18M3 15h18M9 3v18", "columns": "M3 3h18v18H3zM12 3v18",
    "sidebar-left": "M3 3h18v18H3zM9 3v18", "sidebar-right": "M3 3h18v18H3zM15 3v18", "kanban": "M5 3v12M12 3v6M19 3v16",
    "zap": "M13 2 3 14h9l-1 8 10-12h-9z", "sun": "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M6.3 17.7l-1.4 1.4M19.1 4.9l-1.4 1.4",
    "moon": "M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z", "palette": "M12 2a10 10 0 0 0 0 20c1 0 1.5-.7 1.5-1.5 0-.4-.2-.8-.4-1.1-.3-.3-.4-.6-.4-1 0-.8.7-1.5 1.5-1.5H16a6 6 0 0 0 6-6c0-5-4.5-8.9-10-8.9zM7.5 10.5h.01M11 7h.01M16 8.5h.01",
    "code": "m16 18 6-6-6-6M8 6l-6 6 6 6", "terminal": "m4 17 6-6-6-6M12 19h8", "quote": "M3 21c3 0 7-1 7-8V5H3v7h4c0 3-2 5-4 5zM14 21c3 0 7-1 7-8V5h-7v7h4c0 3-2 5-4 5z",
    "bold": "M6 4h8a4 4 0 0 1 0 8H6zM6 12h9a4 4 0 0 1 0 8H6z", "italic": "M19 4h-9M14 20H5M15 4 9 20", "strikethrough": "M16 4H9a3 3 0 0 0-2.8 4M14 12a4 4 0 0 1 0 8H6M4 12h16",
    "highlighter": "m9 11-6 6v3h9l3-3M22 12l-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4", "message-square": "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z",
    "play": "m6 3 14 9-14 9z", "pause": "M6 4h4v16H6zM14 4h4v16h-4z", "square": "M4 4h16v16H4z", "circle": "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z",
    "check-circle": "M22 11.1V12a10 10 0 1 1-5.9-9.1M22 4 12 14l-3-3", "check-square": "m9 11 3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11",
    "sparkles": "M12 3l1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2zM5 3v4M3 5h4M19 17v4M17 19h4", "dice": "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM16 8h.01M8 8h.01M8 16h.01M16 16h.01M12 12h.01",
    "globe": "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18", "home": "m3 10 9-7 9 7v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM9 22V12h6v10",
    "git-fork": "M6 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM18 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM12 15a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM6 9v1a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V9M12 12v3",
    "filter": "M22 3H2l8 9.5V19l4 2v-8.5z", "save": "M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2zM17 21v-8H7v8M7 3v5h8", "send": "m22 2-7 20-4-9-9-4zM22 2 11 13",
    "inbox": "M22 12h-6l-2 3h-4l-2-3H2M5.5 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.7 1.1z", "archive": "M3 3h18v5H3zM5 8v11a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8M10 12h4",
    "layers": "m12 2 10 5-10 5L2 7zM2 17l10 5 10-5M2 12l10 5 10-5", "package": "m16.5 9.4-9-5.2M21 16V8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7l7 4a2 2 0 0 0 2 0l7-4a2 2 0 0 0 1-1.7zM3.3 7 12 12l8.7-5M12 22V12",
    "puzzle": "M10 6V5a2 2 0 1 1 4 0v1h3a1 1 0 0 1 1 1v3h1a2 2 0 1 1 0 4h-1v3a1 1 0 0 1-1 1h-3v-1a2 2 0 1 0-4 0v1H7a1 1 0 0 1-1-1v-3h1a2 2 0 1 0 0-4H6V7a1 1 0 0 1 1-1z",
    "wand": "M15 4V2M15 16v-2M8 9h2M20 9h2M17.8 11.8 19 13M15 9h.01M17.8 6.2 19 5M3 21l9-9M12.2 6.2 11 5", "lightbulb": "M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7c.7.6 1 1.3 1 2.3h6c0-1 .3-1.7 1-2.3A7 7 0 0 0 12 2z",
    "flame": "M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2-1-3-1.1-2.1-.2-4.1 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.2.4-2.3 1-3.3.3 1.6 1.2 2.8 2.5 2.8z",
    "target": "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM12 11a1 1 0 1 0 0 2 1 1 0 0 0 0-2z", "flag": "M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zM4 22v-7",
    "pin": "M12 17v5M9 10.8V6h6v4.8l2 3.2H7zM8 2h8", "user": "M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z", "users": "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8",
    "smile": "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01", "type": "M4 7V4h16v3M9 20h6M12 4v16", "align-left": "M21 6H3M15 12H3M17 18H3",
    "maximize": "M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3", "minimize": "M8 3v3a2 2 0 0 1-2 2H3M21 8h-3a2 2 0 0 1-2-2V3M3 16h3a2 2 0 0 1 2 2v3M16 21v-3a2 2 0 0 1 2-2h3",
    "book": "M4 19.5A2.5 2.5 0 0 1 6.5 17H20V2H6.5A2.5 2.5 0 0 0 4 4.5zM6.5 17A2.5 2.5 0 0 0 4 19.5 2.5 2.5 0 0 0 6.5 22H20v-5", "book-open": "M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2zM22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z",
    "sticky-note": "M15.5 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8.5zM15 3v6h6", "calculator": "M6 2h12a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM8 6h8M16 14v4M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M8 18h.01M12 18h.01",
    "music": "M9 18V5l12-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM21 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z", "mic": "M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3zM19 10v2a7 7 0 0 1-14 0v-2M12 19v3",
    "camera": "M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3zM12 10a3 3 0 1 0 0 6 3 3 0 0 0 0-6z", "mail": "M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM22 6l-10 7L2 6",
    "cloud": "M17.5 19H9a7 7 0 1 1 6.7-9h1.8a4.5 4.5 0 1 1 0 9z", "database": "M12 2c5 0 9 1.3 9 3s-4 3-9 3-9-1.3-9-3 4-3 9-3zM21 12c0 1.7-4 3-9 3s-9-1.3-9-3M3 5v14c0 1.7 4 3 9 3s9-1.3 9-3V5",
    "shield": "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z", "key": "M21 2l-2 2M15.5 7.5l3 3L22 7l-3-3M15.5 7.5 11.4 11.6a5.5 5.5 0 1 1-7.8 7.8 5.5 5.5 0 0 1 7.8-7.8z", "wrench": "M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.8-3.8a6 6 0 0 1-7.9 7.9l-6.9 6.9a2.1 2.1 0 0 1-3-3l6.9-6.9a6 6 0 0 1 7.9-7.9z",
    "scissors": "M6 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM6 15a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM20 4 8.1 15.9M14.5 14.5 20 20M8.1 8.1 12 12", "network": "M9 2h6v6H9zM2 16h6v6H2zM16 16h6v6h-6zM5 16v-3h14v3M12 12V8",
    "brain": "M12 5a3 3 0 1 0-6 .1 4 4 0 0 0-2.5 5.8A4 4 0 0 0 6 18a4 4 0 0 0 6 1.7zM12 5a3 3 0 1 1 6 .1 4 4 0 0 1 2.5 5.8A4 4 0 0 1 18 18a4 4 0 0 1-6 1.7zM12 5v15",
    "map": "M9 3 3 6v15l6-3 6 3 6-3V3l-6 3zM9 3v15M15 6v15", "timer": "M10 2h4M12 14l3-3M12 22a8 8 0 1 0 0-16 8 8 0 0 0 0 16z", "percent": "M19 5 5 19M6.5 4a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM17.5 15a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z",
    "rocket": "M4.5 16.5c-1.5 1.3-2 5-2 5s3.7-.5 5-2c.7-.8.7-2.1-.1-2.9a2.2 2.2 0 0 0-2.9-.1zM12 15l-3-3a22 22 0 0 1 2-4A12.9 12.9 0 0 1 22 2c0 2.7-.8 7.5-6 11a22 22 0 0 1-4 2zM9 12H4s.6-3 2-4c1.6-1.1 5 0 5 0M12 15v5s3-.6 4-2c1.1-1.6 0-5 0-5",
    "box": "M21 8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7l7 4a2 2 0 0 0 2 0l7-4a2 2 0 0 0 1-1.7zM3.3 7 12 12l8.7-5M12 22V12",
    "grip-vertical": "M9 5h.01M9 12h.01M9 19h.01M15 5h.01M15 12h.01M15 19h.01", "sort-asc": "M3 8l4-4 4 4M7 4v16M11 12h4M11 16h7M11 20h10", "sort-desc": "M3 16l4 4 4-4M7 20V4M11 4h10M11 8h7M11 12h4"
  },
  alias: {
    "lucide-": "", "cross": "x", "checkmark": "check", "plus-with-circle": "plus", "trash-2": "trash", "edit": "pencil", "pencil-line": "pencil",
    "document": "file-text", "documents": "copy", "gear": "settings", "cog": "settings", "sliders": "settings", "help": "help-circle", "info-circle": "info",
    "sync": "refresh-cw", "rotate-cw": "refresh-cw", "refresh-ccw": "rotate-ccw", "reset": "rotate-ccw", "undo": "rotate-ccw", "lightning": "zap", "brush": "palette",
    "code-glyph": "code", "kanban-square": "kanban", "graph-glyph": "network", "git-branch": "git-fork", "dot-network": "network", "calendar-with-checkmark": "calendar",
    "calendar-check": "calendar", "calendar-clock": "calendar", "alarm-clock": "clock", "hourglass": "timer", "bot": "sparkles", "wand-2": "wand", "magic-wand": "wand",
    "sticky-notes": "sticky-note", "notebook": "book", "scroll": "file-text", "file-code": "file-text", "file-search": "search", "magnifying-glass": "search",
    "layout": "layout-dashboard", "layout-grid": "layout-dashboard", "left-sidebar": "sidebar-left", "right-sidebar": "sidebar-right", "vertical-three-dots": "more-vertical",
    "three-horizontal-bars": "menu", "hamburger": "menu", "up-chevron-glyph": "chevron-up", "down-chevron-glyph": "chevron-down", "left-arrow": "arrow-left", "right-arrow": "arrow-right",
    "up-arrow-with-tail": "arrow-up", "down-arrow-with-tail": "arrow-down", "right-triangle": "chevron-right", "go-to-file": "file", "open-elsewhere-glyph": "external-link",
    "popup-open": "external-link", "image-file": "image", "pdf-file": "file", "audio-file": "music", "star-list": "star", "bullet-list": "list", "number-list": "list-ordered",
    "checkbox-glyph": "check-square", "check-small": "check", "message": "message-square", "lines-of-text": "align-left", "dice-glyph": "dice", "box-glyph": "box", "clock-glyph": "clock",
    "price-tag-glyph": "tag", "hashtag": "hash", "folder-plus": "folder", "folder-minus": "folder", "file-plus-2": "file-plus", "badge-plus": "plus", "circle-plus": "plus",
    "circle-check": "check-circle", "circle-x": "x", "circle-alert": "alert-circle", "triangle-alert": "alert-triangle", "circle-help": "help-circle", "ellipsis": "more-horizontal",
    "ellipsis-vertical": "more-vertical", "panel-left": "sidebar-left", "panel-right": "sidebar-right", "list-todo": "list-checks", "square-check": "check-square",
    "square-pen": "pencil", "pen": "pencil", "feather": "pencil", "files": "copy", "link-2": "link", "unlink": "link", "shuffle": "dice", "repeat": "refresh-cw",
    "send-horizontal": "send", "messages-square": "message-square", "pilcrow": "align-left", "text": "type", "heading": "type", "sigma": "calculator", "workflow": "network"
  },
  resolve(id) {
    let k = String(id || "").trim();
    if (PluginIcons.custom[k]) return { custom: PluginIcons.custom[k] };
    if (k.indexOf("lucide-") === 0) k = k.slice(7);
    if (PluginIcons.alias[k]) k = PluginIcons.alias[k];
    return PluginIcons.paths[k] ? { path: PluginIcons.paths[k] } : null;
  },
  svg(id, size) {
    const r = PluginIcons.resolve(id) || { path: PluginIcons.paths.puzzle };
    const s = size || 18;
    if (r.custom) return '<svg xmlns="http://www.w3.org/2000/svg" width="' + s + '" height="' + s + '" viewBox="0 0 100 100" class="svg-icon ' + escAttr(String(id)) + '" fill="currentColor" stroke="currentColor">' + r.custom + "</svg>";
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="svg-icon lucide-' + escAttr(String(id).replace(/^lucide-/, "")) + '"><path d="' + r.path + '"/></svg>';
  },
  set(el, id, size) {
    if (!el) return;
    while (el.firstChild) el.removeChild(el.firstChild);
    if (!id) return;
    el.insertAdjacentHTML("beforeend", PluginIcons.svg(id, size));
  },
  get(id) {
    if (!PluginIcons.resolve(id)) return null;
    const t = document.createElement("template");
    t.innerHTML = PluginIcons.svg(id);
    return t.content.firstChild;
  },
  ids() { return Object.keys(PluginIcons.paths).map(function (k) { return "lucide-" + k; }).concat(Object.keys(PluginIcons.custom)); }
};

function pluginTooltip(el, text) {
  if (!el) return;
  if (text) { el.setAttribute("aria-label", text); el.title = text; } else { el.removeAttribute("aria-label"); el.removeAttribute("title"); }
}

/* ---- fuzzy and simple search, as Obsidian's prepareFuzzySearch / prepareSimpleSearch ---- */
const PluginSearch = {
  fuzzy(query) {
    const q = String(query || "").toLowerCase().replace(/\s+/g, "");
    return function (text) {
      if (!q) return { score: 0, matches: [] };
      const t = String(text || "").toLowerCase(), matches = [];
      let at = 0, score = 0, prev = -2;
      for (let i = 0; i < q.length; i++) {
        const k = t.indexOf(q[i], at);
        if (k === -1) return null;
        score += (k === prev + 1 ? 5 : 1) + (k === 0 || /[\s/_.-]/.test(t[k - 1]) ? 4 : 0);
        if (matches.length && matches[matches.length - 1][1] === k) matches[matches.length - 1][1] = k + 1; else matches.push([k, k + 1]);
        prev = k; at = k + 1;
      }
      return { score: score - t.length * 0.01 - 10, matches: matches };
    };
  },
  simple(query) {
    const words = String(query || "").toLowerCase().split(/\s+/).filter(Boolean);
    return function (text) {
      const t = String(text || "").toLowerCase(), matches = [];
      for (let i = 0; i < words.length; i++) {
        const k = t.indexOf(words[i]);
        if (k === -1) return null;
        matches.push([k, k + words[i].length]);
      }
      matches.sort(function (a, b) { return a[0] - b[0]; });
      return { score: -matches.length, matches: matches };
    };
  },
  renderMatches(el, text, matches, offset) {
    offset = offset || 0;
    let at = 0;
    (matches || []).forEach(function (m) {
      const a = m[0] + offset, b = m[1] + offset;
      if (a < 0 || a > text.length) return;
      if (a > at) el.appendChild(document.createTextNode(text.slice(at, a)));
      const s = document.createElement("span");
      s.className = "suggestion-highlight";
      s.textContent = text.slice(a, b);
      el.appendChild(s);
      at = b;
    });
    if (at < text.length) el.appendChild(document.createTextNode(text.slice(at)));
  }
};

/* ---- Notice: a message in the top-right corner ---- */
class PluginNotice {
  constructor(message, duration) {
    let box = document.querySelector(".notice-container");
    if (!box) { box = document.createElement("div"); box.className = "notice-container"; document.body.appendChild(box); }
    this.noticeEl = document.createElement("div");
    this.noticeEl.className = "notice";
    this.containerEl = this.noticeEl;
    this.messageEl = document.createElement("div");
    this.messageEl.className = "notice-message";
    this.noticeEl.appendChild(this.messageEl);
    this.setMessage(message);
    this.noticeEl.addEventListener("click", this.hide.bind(this));
    box.appendChild(this.noticeEl);
    const ms = duration === undefined ? 4500 : duration;
    if (ms > 0) this.timer = setTimeout(this.hide.bind(this), ms);
  }
  setMessage(message) {
    while (this.messageEl.firstChild) this.messageEl.removeChild(this.messageEl.firstChild);
    if (message instanceof Node) this.messageEl.appendChild(message); else this.messageEl.textContent = message === undefined ? "" : String(message);
    return this;
  }
  hide() { clearTimeout(this.timer); if (this.noticeEl.parentNode) this.noticeEl.parentNode.removeChild(this.noticeEl); }
}

/* ---- Scope: keys handled while a modal or popup is open ---- */
class PluginScope {
  constructor(parent) { this.parent = parent || null; this.keys = []; }
  register(modifiers, key, func) { const h = { scope: this, modifiers: modifiers || [], key: key, func: func }; this.keys.push(h); return h; }
  unregister(h) { const i = this.keys.indexOf(h); if (i !== -1) this.keys.splice(i, 1); }
  handle(e) {
    for (let i = 0; i < this.keys.length; i++) {
      const h = this.keys[i];
      if (h.key !== null && h.key !== undefined && String(h.key).toLowerCase() !== String(e.key).toLowerCase()) continue;
      if (h.modifiers.length && !PluginKeymap.modsMatch(e, h.modifiers)) continue;
      const r = h.func(e, { modifiers: PluginKeymap.modsOf(e), key: e.key, vkey: e.key });
      if (r === false) { e.preventDefault(); return true; }
    }
    return this.parent ? this.parent.handle(e) : false;
  }
}
const PluginKeymap = {
  mac: /Mac|iPhone|iPad/.test(navigator.platform || ""),
  modsOf(e) {
    const out = [];
    if (e.ctrlKey) out.push(PluginKeymap.mac ? "Ctrl" : "Mod");
    if (e.metaKey) out.push(PluginKeymap.mac ? "Mod" : "Meta");
    if (e.altKey) out.push("Alt");
    if (e.shiftKey) out.push("Shift");
    return out.join(",");
  },
  modsMatch(e, mods) {
    const want = (Array.isArray(mods) ? mods : String(mods).split(",")).map(function (m) { return String(m).trim(); }).filter(Boolean);
    const mod = PluginKeymap.mac ? e.metaKey : e.ctrlKey;
    const has = { Mod: mod, Ctrl: e.ctrlKey, Meta: e.metaKey, Alt: e.altKey, Shift: e.shiftKey };
    const need = { Mod: false, Ctrl: false, Meta: false, Alt: false, Shift: false };
    want.forEach(function (m) { need[m] = true; });
    if (need.Mod) { if (!mod) return false; } else if (PluginKeymap.mac ? e.metaKey && !need.Meta : e.ctrlKey && !need.Ctrl) return false;
    if (need.Ctrl && !e.ctrlKey) return false;
    if (need.Meta && !e.metaKey) return false;
    return has.Alt === need.Alt && has.Shift === need.Shift;
  },
  isModifier(e, m) { return m === "Mod" ? (PluginKeymap.mac ? e.metaKey : e.ctrlKey) : m === "Ctrl" ? e.ctrlKey : m === "Meta" ? e.metaKey : m === "Alt" ? e.altKey : m === "Shift" ? e.shiftKey : false; },
  isModEvent(e) {
    if (!e) return false;
    const mod = PluginKeymap.mac ? e.metaKey : e.ctrlKey;
    if (mod && e.altKey && e.shiftKey) return "window";
    if (mod && e.altKey) return "split";
    if (mod || e.button === 1) return "tab";
    return false;
  }
};

/* ---- Modal ---- */
const PluginModals = { open: [] };
document.addEventListener("keydown", function (e) {
  const top = PluginModals.open[PluginModals.open.length - 1];
  if (!top) return;
  if (top.scope && top.scope.handle(e)) { e.stopPropagation(); return; }
  if (e.key === "Escape" && !e.defaultPrevented) { e.preventDefault(); e.stopPropagation(); top.close(); }
}, true);

class PluginModal {
  constructor(app) {
    this.app = app;
    this.scope = new PluginScope();
    this.shouldRestoreSelection = true;
    this.containerEl = document.createElement("div");
    this.containerEl.className = "modal-container mod-dim";
    const bg = document.createElement("div");
    bg.className = "modal-bg";
    bg.addEventListener("mousedown", this.close.bind(this));
    this.containerEl.appendChild(bg);
    this.modalEl = document.createElement("div");
    this.modalEl.className = "modal";
    this.modalEl.setAttribute("role", "dialog");
    this.containerEl.appendChild(this.modalEl);
    const x = document.createElement("div");
    x.className = "modal-close-button";
    x.setAttribute("aria-label", "Close");
    x.addEventListener("click", this.close.bind(this));
    this.modalEl.appendChild(x);
    this.headerEl = document.createElement("div");
    this.headerEl.className = "modal-header";
    this.modalEl.appendChild(this.headerEl);
    this.titleEl = document.createElement("div");
    this.titleEl.className = "modal-title";
    this.headerEl.appendChild(this.titleEl);
    this.contentEl = document.createElement("div");
    this.contentEl.className = "modal-content";
    this.modalEl.appendChild(this.contentEl);
    this.isOpen = false;
  }
  open() {
    if (this.isOpen) return;
    this.isOpen = true;
    this.lastFocus = document.activeElement;
    document.body.appendChild(this.containerEl);
    PluginModals.open.push(this);
    try { const r = this.onOpen(); if (r && r.catch) r.catch(function (e) { console.error(e); }); } catch (e) { console.error(e); }
    const first = this.modalEl.querySelector("input, textarea, select, button:not(.modal-close-button)");
    if (first && !this.modalEl.contains(document.activeElement)) first.focus();
  }
  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    const i = PluginModals.open.indexOf(this);
    if (i !== -1) PluginModals.open.splice(i, 1);
    if (this.containerEl.parentNode) this.containerEl.parentNode.removeChild(this.containerEl);
    try { this.onClose(); } catch (e) { console.error(e); }
    if (this.closeCallback) try { this.closeCallback(); } catch (e) { console.error(e); }
    if (this.shouldRestoreSelection && this.lastFocus && this.lastFocus.isConnected && this.lastFocus.focus) this.lastFocus.focus();
  }
  onOpen() {}
  onClose() {}
  setTitle(t) { this.titleEl.textContent = t; return this; }
  setContent(c) { this.contentEl.textContent = ""; if (c instanceof Node) this.contentEl.appendChild(c); else this.contentEl.textContent = String(c); return this; }
  setCloseCallback(cb) { this.closeCallback = cb; return this; }
}

/* the list of suggestions inside SuggestModal and the popovers */
class PluginChooser {
  constructor(owner, containerEl) { this.owner = owner; this.containerEl = containerEl; this.values = []; this.suggestions = []; this.selectedItem = 0; }
  setSuggestions(values) {
    this.containerEl.textContent = "";
    this.values = values || [];
    this.suggestions = [];
    this.values.forEach(function (v, i) {
      const el = document.createElement("div");
      el.className = "suggestion-item";
      el.addEventListener("mousemove", function () { if (this.selectedItem !== i) this.setSelectedItem(i, false); }.bind(this));
      el.addEventListener("mousedown", function (e) { e.preventDefault(); this.setSelectedItem(i, false); this.useSelectedItem(e); }.bind(this));
      this.containerEl.appendChild(el);
      this.suggestions.push(el);
      try { this.owner.renderSuggestion(v, el); } catch (e) { el.textContent = String(v); console.error(e); }
    }, this);
    this.setSelectedItem(0, false);
  }
  setSelectedItem(i, scroll) {
    if (!this.suggestions.length) { this.selectedItem = 0; return; }
    i = (i + this.suggestions.length) % this.suggestions.length;
    this.suggestions.forEach(function (el, k) { el.classList.toggle("is-selected", k === i); });
    this.selectedItem = i;
    if (scroll !== false && this.suggestions[i].scrollIntoView) this.suggestions[i].scrollIntoView({ block: "nearest" });
  }
  moveUp(e) { if (e) e.preventDefault(); this.setSelectedItem(this.selectedItem - 1, true); return false; }
  moveDown(e) { if (e) e.preventDefault(); this.setSelectedItem(this.selectedItem + 1, true); return false; }
  useSelectedItem(e) {
    const v = this.values[this.selectedItem];
    if (v === undefined) return false;
    this.owner.selectSuggestion(v, e || new KeyboardEvent("keydown", { key: "Enter" }));
    return true;
  }
}

class PluginSuggestModal extends PluginModal {
  constructor(app) {
    super(app);
    this.limit = 100;
    this.emptyStateText = "No results found.";
    this.modalEl.classList.add("prompt");
    this.headerEl.remove();
    this.contentEl.remove();
    const ic = document.createElement("div");
    ic.className = "prompt-input-container";
    this.inputEl = document.createElement("input");
    this.inputEl.className = "prompt-input";
    this.inputEl.setAttribute("enterkeyhint", "done");
    this.inputEl.spellcheck = false;
    ic.appendChild(this.inputEl);
    this.modalEl.appendChild(ic);
    this.resultContainerEl = document.createElement("div");
    this.resultContainerEl.className = "prompt-results";
    this.modalEl.appendChild(this.resultContainerEl);
    this.instructionsEl = document.createElement("div");
    this.instructionsEl.className = "prompt-instructions";
    this.modalEl.appendChild(this.instructionsEl);
    this.chooser = new PluginChooser(this, this.resultContainerEl);
    this.inputEl.addEventListener("input", this.onInput.bind(this));
    this.scope.register([], "ArrowUp", function (e) { return this.chooser.moveUp(e); }.bind(this));
    this.scope.register([], "ArrowDown", function (e) { return this.chooser.moveDown(e); }.bind(this));
    this.scope.register([], "Enter", function (e) { if (!this.chooser.useSelectedItem(e)) this.onNoSuggestion(); return false; }.bind(this));
  }
  setPlaceholder(t) { this.inputEl.placeholder = t; }
  setInstructions(list) {
    this.instructionsEl.textContent = "";
    (list || []).forEach(function (ins) {
      const d = document.createElement("div"); d.className = "prompt-instruction";
      const c = document.createElement("span"); c.className = "prompt-instruction-command"; c.textContent = ins.command;
      const p = document.createElement("span"); p.textContent = ins.purpose;
      d.appendChild(c); d.appendChild(p); this.instructionsEl.appendChild(d);
    }, this);
  }
  onOpen() { this.onInput(); this.inputEl.focus(); }
  onInput() {
    const q = this.inputEl.value, seq = (this.inputSeq = (this.inputSeq || 0) + 1);
    Promise.resolve().then(function () { return this.getSuggestions(q); }.bind(this)).then(function (list) {
      if (seq !== this.inputSeq) return;
      list = (list || []).slice(0, this.limit);
      if (!list.length) {
        this.chooser.setSuggestions([]);
        if (this.emptyStateText) { const e = document.createElement("div"); e.className = "suggestion-empty"; e.textContent = this.emptyStateText; this.resultContainerEl.appendChild(e); }
        return;
      }
      this.chooser.setSuggestions(list);
    }.bind(this)).catch(function (e) { console.error(e); });
  }
  selectSuggestion(value, evt) { this.close(); this.onChooseSuggestion(value, evt); }
  onNoSuggestion() {}
  getSuggestions() { return []; }
  renderSuggestion(v, el) { el.textContent = String(v); }
  onChooseSuggestion() {}
}

class PluginFuzzySuggestModal extends PluginSuggestModal {
  getSuggestions(query) {
    const fn = PluginSearch.fuzzy(query), out = [];
    (this.getItems() || []).forEach(function (item) {
      const m = fn(this.getItemText(item));
      if (m) out.push({ item: item, match: m });
    }, this);
    if (query) out.sort(function (a, b) { return b.match.score - a.match.score; });
    return out;
  }
  renderSuggestion(r, el) { PluginSearch.renderMatches(el, String(this.getItemText(r.item)), r.match.matches); }
  onChooseSuggestion(r, evt) { this.onChooseItem(r.item, evt); }
  getItems() { return []; }
  getItemText(item) { return String(item); }
  onChooseItem() {}
}

/* a suggestion popover under an input or the editor's caret */
class PluginPopoverSuggest {
  constructor(app, scope) {
    this.app = app;
    this.scope = scope || new PluginScope();
    this.suggestEl = document.createElement("div");
    this.suggestEl.className = "suggestion-container";
    this.suggestions = document.createElement("div");
    this.suggestions.className = "suggestion";
    this.suggestEl.appendChild(this.suggestions);
    this.suggestEl.addEventListener("mousedown", function (e) { e.preventDefault(); });
    this.chooser = new PluginChooser(this, this.suggestions);
    this.isOpen = false;
  }
  open() { if (!this.isOpen) { document.body.appendChild(this.suggestEl); this.isOpen = true; } }
  close() { if (this.isOpen) { this.suggestEl.remove(); this.isOpen = false; } }
  placeAt(x, y, below) {
    const r = this.suggestEl.getBoundingClientRect();
    const left = Math.max(4, Math.min(x, window.innerWidth - r.width - 4));
    let top = y;
    if (top + r.height > window.innerHeight - 4 && below) top = below - r.height - 4;
    this.suggestEl.style.left = left + "px";
    this.suggestEl.style.top = Math.max(4, top) + "px";
  }
  handleKey(e) {
    if (!this.isOpen || !this.chooser.values.length) return false;
    if (e.key === "ArrowDown") { this.chooser.moveDown(e); return true; }
    if (e.key === "ArrowUp") { this.chooser.moveUp(e); return true; }
    if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); this.chooser.useSelectedItem(e); return true; }
    if (e.key === "Escape") { e.preventDefault(); this.close(); return true; }
    return false;
  }
  renderSuggestion(v, el) { el.textContent = String(v); }
  selectSuggestion() {}
}

class PluginAbstractInputSuggest extends PluginPopoverSuggest {
  constructor(app, inputEl) {
    super(app);
    this.inputEl = inputEl;
    this.limit = 100;
    inputEl.addEventListener("input", this.onInputChanged.bind(this));
    inputEl.addEventListener("focus", this.onInputChanged.bind(this));
    inputEl.addEventListener("blur", this.close.bind(this));
    inputEl.addEventListener("keydown", function (e) { if (this.handleKey(e)) e.stopPropagation(); }.bind(this));
  }
  onInputChanged() {
    const q = this.getValue(), seq = (this.seq = (this.seq || 0) + 1);
    Promise.resolve().then(function () { return this.getSuggestions(q); }.bind(this)).then(function (list) {
      if (seq !== this.seq) return;
      list = (list || []).slice(0, this.limit);
      if (!list.length || document.activeElement !== this.inputEl) { this.close(); return; }
      this.chooser.setSuggestions(list);
      this.open();
      const r = this.inputEl.getBoundingClientRect();
      this.suggestEl.style.minWidth = r.width + "px";
      this.placeAt(r.left, r.bottom + 2, r.top);
    }.bind(this)).catch(function (e) { console.error(e); });
  }
  getValue() { return this.inputEl.value !== undefined ? this.inputEl.value : this.inputEl.textContent; }
  setValue(v) { if (this.inputEl.value !== undefined) this.inputEl.value = v; else this.inputEl.textContent = v; }
  onSelect(cb) { this.selectCb = cb; return this; }
  selectSuggestion(v, evt) { if (this.selectCb) this.selectCb(v, evt); }
  getSuggestions() { return []; }
}

/* ---- Menu ---- */
class PluginMenuItem {
  constructor(menu) {
    this.menu = menu;
    this.dom = document.createElement("div");
    this.dom.className = "menu-item";
    this.iconEl = document.createElement("div"); this.iconEl.className = "menu-item-icon";
    this.titleEl = document.createElement("div"); this.titleEl.className = "menu-item-title";
    this.dom.appendChild(this.iconEl); this.dom.appendChild(this.titleEl);
    this.dom.addEventListener("click", function (e) {
      if (this.disabled || this.isLabel) return;
      if (this.submenu) { e.stopPropagation(); return; }
      this.menu.hide();
      if (this.callback) try { this.callback(e); } catch (er) { console.error(er); }
    }.bind(this));
  }
  setTitle(t) { this.titleEl.textContent = ""; if (t instanceof Node) this.titleEl.appendChild(t); else this.titleEl.textContent = String(t); return this; }
  setIcon(icon) { PluginIcons.set(this.iconEl, icon, 16); return this; }
  setChecked(on) { this.dom.classList.toggle("mod-checked", !!on); if (on && !this.iconEl.firstChild) PluginIcons.set(this.iconEl, "check", 16); return this; }
  setDisabled(on) { this.disabled = !!on; this.dom.classList.toggle("is-disabled", !!on); return this; }
  setIsLabel(on) { this.isLabel = !!on; this.dom.classList.toggle("is-label", !!on); return this; }
  setWarning(on) { this.dom.classList.toggle("is-warning", !!on); return this; }
  setSection(s) { this.section = s; return this; }
  setActive(on) { this.dom.classList.toggle("selected", !!on); return this; }
  onClick(cb) { this.callback = cb; return this; }
  setSubmenu() {
    this.submenu = new PluginMenu();
    this.submenu.parent = this.menu;
    this.dom.classList.add("has-submenu");
    this.dom.addEventListener("mouseenter", function () {
      const r = this.dom.getBoundingClientRect();
      this.submenu.showAtPosition({ x: r.right - 2, y: r.top });
    }.bind(this));
    return this.submenu;
  }
}
const PluginMenus = { open: null };
class PluginMenu {
  constructor() {
    this.items = [];
    this.dom = document.createElement("div");
    this.dom.className = "menu";
    this.hideCbs = [];
    this.scope = new PluginScope();
  }
  addItem(cb) { const it = new PluginMenuItem(this); this.items.push(it); try { cb(it); } catch (e) { console.error(e); } return this; }
  addSeparator() { this.items.push("sep"); return this; }
  setNoIcon() { this.noIcon = true; return this; }
  setUseNativeMenu() { return this; }
  onHide(cb) { this.hideCbs.push(cb); }
  showAtMouseEvent(e) { return this.showAtPosition({ x: e.clientX, y: e.clientY }); }
  showAtPosition(pos) {
    if (!this.parent && PluginMenus.open && PluginMenus.open !== this) PluginMenus.open.hide();
    this.dom.textContent = "";
    /* items grouped by section, as Obsidian does; separators between groups */
    let last = null;
    this.items.forEach(function (it) {
      if (it === "sep") { if (this.dom.lastChild && !this.dom.lastChild.classList.contains("menu-separator")) { const s = document.createElement("div"); s.className = "menu-separator"; this.dom.appendChild(s); } last = null; return; }
      if (last !== null && it.section !== last && this.dom.lastChild && !this.dom.lastChild.classList.contains("menu-separator")) { const s2 = document.createElement("div"); s2.className = "menu-separator"; this.dom.appendChild(s2); }
      last = it.section;
      if (this.noIcon) it.iconEl.style.display = "none";
      this.dom.appendChild(it.dom);
    }, this);
    document.body.appendChild(this.dom);
    const r = this.dom.getBoundingClientRect();
    this.dom.style.left = Math.max(4, Math.min(pos.x, window.innerWidth - r.width - 4)) + "px";
    this.dom.style.top = Math.max(4, Math.min(pos.y, window.innerHeight - r.height - 4)) + "px";
    if (!this.parent) {
      PluginMenus.open = this;
      this.away = function (e) { if (!e.target.closest || !e.target.closest(".menu")) this.hide(); }.bind(this);
      this.key = function (e) { if (e.key === "Escape") { e.preventDefault(); this.hide(); } }.bind(this);
      setTimeout(function () { document.addEventListener("mousedown", this.away, true); document.addEventListener("keydown", this.key, true); }.bind(this), 0);
    }
    return this;
  }
  hide() {
    if (this.parent && this.parent.dom.isConnected) { this.parent.hide(); return; }
    this.items.forEach(function (it) { if (it !== "sep" && it.submenu) it.submenu.dom.remove(); });
    if (!this.dom.isConnected) return;
    this.dom.remove();
    if (PluginMenus.open === this) PluginMenus.open = null;
    document.removeEventListener("mousedown", this.away, true);
    document.removeEventListener("keydown", this.key, true);
    this.hideCbs.forEach(function (cb) { try { cb(); } catch (e) { console.error(e); } });
  }
  close() { this.hide(); }
  static forEvent(e) { const m = new PluginMenu(); m.atEvent = e; return m; }
}
class PluginMenuSeparator {}

/* ---- Setting and its controls ---- */
class PluginBaseComponent {
  constructor() { this.disabled = false; }
  then(cb) { cb(this); return this; }
  setDisabled(on) { this.disabled = !!on; const el = this.inputEl || this.selectEl || this.sliderEl || this.buttonEl || this.toggleEl || this.colorPickerEl || this.extraSettingsEl; if (el) { if ("disabled" in el) el.disabled = !!on; el.classList.toggle("is-disabled", !!on); } return this; }
}
class PluginValueComponent extends PluginBaseComponent {
  registerOptionListener(listeners, key) { listeners[key] = function (v) { if (v !== undefined) this.setValue(v); return this.getValue(); }.bind(this); return this; }
}
class PluginAbstractTextComponent extends PluginValueComponent {
  constructor(inputEl) {
    super();
    this.inputEl = inputEl;
    this.changeCbs = [];
    inputEl.addEventListener("input", this.onChanged.bind(this));
  }
  getValue() { return this.inputEl.value; }
  setValue(v) { this.inputEl.value = v === undefined || v === null ? "" : v; return this; }
  setPlaceholder(t) { this.inputEl.placeholder = t; return this; }
  onChanged() { const v = this.getValue(); this.changeCbs.forEach(function (cb) { try { const r = cb(v); if (r && r.catch) r.catch(function (e) { console.error(e); }); } catch (e) { console.error(e); } }); }
  onChange(cb) { this.changeCbs.push(cb); return this; }
}
class PluginTextComponent extends PluginAbstractTextComponent {
  constructor(containerEl) { const i = document.createElement("input"); i.type = "text"; i.spellcheck = false; containerEl.appendChild(i); super(i); }
}
class PluginTextAreaComponent extends PluginAbstractTextComponent {
  constructor(containerEl) { const t = document.createElement("textarea"); containerEl.appendChild(t); super(t); }
}
class PluginSearchComponent extends PluginAbstractTextComponent {
  constructor(containerEl) {
    const wrap = document.createElement("div"); wrap.className = "search-input-container";
    const i = document.createElement("input"); i.type = "search"; i.spellcheck = false; wrap.appendChild(i);
    containerEl.appendChild(wrap);
    super(i);
    this.containerEl = wrap;
    this.clearButtonEl = document.createElement("div"); this.clearButtonEl.className = "search-input-clear-button";
    this.clearButtonEl.addEventListener("click", function () { this.setValue(""); this.onChanged(); this.inputEl.focus(); }.bind(this));
    wrap.appendChild(this.clearButtonEl);
  }
  setClass(c) { this.containerEl.classList.add(c); return this; }
}
class PluginMomentFormatComponent extends PluginTextComponent {
  setDefaultFormat(f) { this.defaultFormat = f; this.inputEl.placeholder = f; this.updateSample(); return this; }
  setSampleEl(el) { this.sampleEl = el; this.updateSample(); return this; }
  onChanged() { this.updateSample(); super.onChanged(); }
  updateSample() { if (this.sampleEl) this.sampleEl.textContent = PluginTime.moment().format(this.getValue() || this.defaultFormat || "YYYY-MM-DD"); }
  setValue(v) { super.setValue(v); this.updateSample(); return this; }
}
class PluginToggleComponent extends PluginValueComponent {
  constructor(containerEl) {
    super();
    this.toggleEl = document.createElement("div");
    this.toggleEl.className = "checkbox-container";
    this.toggleEl.setAttribute("role", "switch");
    this.toggleEl.tabIndex = 0;
    containerEl.appendChild(this.toggleEl);
    this.value = false;
    this.changeCbs = [];
    const flip = function (e) { if (this.disabled) return; e.preventDefault(); this.setValue(!this.value); this.changeCbs.forEach(function (cb) { try { cb(this.value); } catch (er) { console.error(er); } }, this); }.bind(this);
    this.toggleEl.addEventListener("click", flip);
    this.toggleEl.addEventListener("keydown", function (e) { if (e.key === " " || e.key === "Enter") flip(e); });
  }
  getValue() { return this.value; }
  setValue(on) { this.value = !!on; this.toggleEl.classList.toggle("is-enabled", this.value); this.toggleEl.setAttribute("aria-checked", String(this.value)); return this; }
  setTooltip(t) { pluginTooltip(this.toggleEl, t); return this; }
  onClick() { this.toggleEl.click(); }
  onChange(cb) { this.changeCbs.push(cb); return this; }
}
class PluginDropdownComponent extends PluginValueComponent {
  constructor(containerEl) {
    super();
    this.selectEl = document.createElement("select");
    this.selectEl.className = "dropdown";
    containerEl.appendChild(this.selectEl);
    this.changeCbs = [];
    this.selectEl.addEventListener("change", function () { const v = this.getValue(); this.changeCbs.forEach(function (cb) { try { cb(v); } catch (e) { console.error(e); } }); }.bind(this));
  }
  addOption(value, display) { const o = document.createElement("option"); o.value = value; o.textContent = display; this.selectEl.appendChild(o); return this; }
  addOptions(map) { Object.keys(map || {}).forEach(function (k) { this.addOption(k, map[k]); }, this); return this; }
  getValue() { return this.selectEl.value; }
  setValue(v) { this.selectEl.value = v; return this; }
  onChange(cb) { this.changeCbs.push(cb); return this; }
}
class PluginSliderComponent extends PluginValueComponent {
  constructor(containerEl) {
    super();
    this.sliderEl = document.createElement("input");
    this.sliderEl.type = "range";
    this.sliderEl.className = "slider";
    containerEl.appendChild(this.sliderEl);
    this.changeCbs = [];
    this.instant = true;
    const fire = function () { const v = this.getValue(); this.sliderEl.title = String(v); this.changeCbs.forEach(function (cb) { try { cb(v); } catch (e) { console.error(e); } }); }.bind(this);
    this.sliderEl.addEventListener("input", function () { if (this.instant) fire(); }.bind(this));
    this.sliderEl.addEventListener("change", function () { if (!this.instant) fire(); }.bind(this));
  }
  setLimits(min, max, step) { if (min !== null && min !== undefined) this.sliderEl.min = min; if (max !== null && max !== undefined) this.sliderEl.max = max; this.sliderEl.step = step === "any" ? "any" : step || 1; return this; }
  setInstant(on) { this.instant = !!on; return this; }
  setDynamicTooltip() { return this; }
  showTooltip() {}
  getValuePretty() { return String(this.getValue()); }
  getValue() { return Number(this.sliderEl.value); }
  setValue(v) { this.sliderEl.value = v; this.sliderEl.title = String(v); return this; }
  onChange(cb) { this.changeCbs.push(cb); return this; }
}
class PluginButtonComponent extends PluginBaseComponent {
  constructor(containerEl) {
    super();
    this.buttonEl = document.createElement("button");
    containerEl.appendChild(this.buttonEl);
    this.buttonEl.addEventListener("click", function (e) { if (this.disabled || !this.cb) return; try { const r = this.cb(e); if (r && r.catch) r.catch(function (er) { console.error(er); }); } catch (er) { console.error(er); } }.bind(this));
  }
  setButtonText(t) { this.buttonEl.textContent = t; return this; }
  setIcon(icon) { PluginIcons.set(this.buttonEl, icon, 16); return this; }
  setCta() { this.buttonEl.classList.add("mod-cta"); return this; }
  removeCta() { this.buttonEl.classList.remove("mod-cta"); return this; }
  setWarning() { this.buttonEl.classList.add("mod-warning"); return this; }
  setClass(c) { this.buttonEl.classList.add(c); return this; }
  setTooltip(t) { pluginTooltip(this.buttonEl, t); return this; }
  onClick(cb) { this.cb = cb; return this; }
}
class PluginExtraButtonComponent extends PluginBaseComponent {
  constructor(containerEl) {
    super();
    this.extraSettingsEl = document.createElement("div");
    this.extraSettingsEl.className = "clickable-icon extra-setting-button";
    this.extraSettingsEl.tabIndex = 0;
    containerEl.appendChild(this.extraSettingsEl);
    PluginIcons.set(this.extraSettingsEl, "settings", 16);
    this.extraSettingsEl.addEventListener("click", function (e) { if (!this.disabled && this.cb) this.cb(e); }.bind(this));
  }
  setIcon(icon) { PluginIcons.set(this.extraSettingsEl, icon, 16); return this; }
  setTooltip(t) { pluginTooltip(this.extraSettingsEl, t); return this; }
  onClick(cb) { this.cb = cb; return this; }
}
class PluginColorComponent extends PluginValueComponent {
  constructor(containerEl) {
    super();
    this.colorPickerEl = document.createElement("input");
    this.colorPickerEl.type = "color";
    containerEl.appendChild(this.colorPickerEl);
    this.changeCbs = [];
    this.colorPickerEl.addEventListener("input", function () { const v = this.getValue(); this.changeCbs.forEach(function (cb) { try { cb(v); } catch (e) { console.error(e); } }); }.bind(this));
  }
  getValue() { return this.colorPickerEl.value; }
  setValue(v) { this.colorPickerEl.value = v; return this; }
  getValueRgb() { const h = this.getValue(); return { r: parseInt(h.slice(1, 3), 16), g: parseInt(h.slice(3, 5), 16), b: parseInt(h.slice(5, 7), 16) }; }
  setValueRgb(c) { const x = function (n) { return ("0" + Math.round(n).toString(16)).slice(-2); }; return this.setValue("#" + x(c.r) + x(c.g) + x(c.b)); }
  getValueHsl() {
    const c = this.getValueRgb(), r = c.r / 255, g = c.g / 255, b = c.b / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
    let h = 0, s = 0;
    if (mx !== mn) { const d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; }
    return { h: h, s: s, l: l };
  }
  setValueHsl(c) {
    const s = c.s, l = c.l, k = function (n) { return (n + c.h / 30) % 12; }, a = s * Math.min(l, 1 - l);
    const f = function (n) { return 255 * (l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))); };
    return this.setValueRgb({ r: f(0), g: f(8), b: f(4) });
  }
  onChange(cb) { this.changeCbs.push(cb); return this; }
}
class PluginProgressBarComponent extends PluginValueComponent {
  constructor(containerEl) { super(); this.progressBar = document.createElement("progress"); this.progressBar.max = 100; containerEl.appendChild(this.progressBar); }
  getValue() { return this.progressBar.value; }
  setValue(v) { this.progressBar.value = v; return this; }
}

class PluginSetting {
  constructor(containerEl) {
    this.settingEl = document.createElement("div"); this.settingEl.className = "setting-item";
    this.infoEl = document.createElement("div"); this.infoEl.className = "setting-item-info";
    this.nameEl = document.createElement("div"); this.nameEl.className = "setting-item-name";
    this.descEl = document.createElement("div"); this.descEl.className = "setting-item-description";
    this.controlEl = document.createElement("div"); this.controlEl.className = "setting-item-control";
    this.infoEl.appendChild(this.nameEl); this.infoEl.appendChild(this.descEl);
    this.settingEl.appendChild(this.infoEl); this.settingEl.appendChild(this.controlEl);
    containerEl.appendChild(this.settingEl);
    this.components = [];
  }
  setName(n) { this.nameEl.textContent = ""; if (n instanceof Node) this.nameEl.appendChild(n); else this.nameEl.textContent = n === undefined ? "" : String(n); return this; }
  setDesc(d) { this.descEl.textContent = ""; if (d instanceof Node) this.descEl.appendChild(d); else this.descEl.textContent = d === undefined ? "" : String(d); return this; }
  setClass(c) { this.settingEl.classList.add(c); return this; }
  setTooltip(t) { pluginTooltip(this.nameEl, t); return this; }
  setHeading() { this.settingEl.classList.add("setting-item-heading"); return this; }
  setDisabled(on) { this.settingEl.classList.toggle("is-disabled", !!on); this.components.forEach(function (c) { c.setDisabled(on); }); return this; }
  add(Ctor, cb) { const c = new Ctor(this.controlEl); this.components.push(c); if (cb) try { cb(c); } catch (e) { console.error(e); } return this; }
  addButton(cb) { return this.add(PluginButtonComponent, cb); }
  addExtraButton(cb) { return this.add(PluginExtraButtonComponent, cb); }
  addToggle(cb) { return this.add(PluginToggleComponent, cb); }
  addText(cb) { return this.add(PluginTextComponent, cb); }
  addSearch(cb) { return this.add(PluginSearchComponent, cb); }
  addTextArea(cb) { return this.add(PluginTextAreaComponent, cb); }
  addMomentFormat(cb) { return this.add(PluginMomentFormatComponent, cb); }
  addDropdown(cb) { return this.add(PluginDropdownComponent, cb); }
  addColorPicker(cb) { return this.add(PluginColorComponent, cb); }
  addProgressBar(cb) { return this.add(PluginProgressBarComponent, cb); }
  addSlider(cb) { return this.add(PluginSliderComponent, cb); }
  addComponent(cb) { const el = document.createElement("div"); this.controlEl.appendChild(el); const c = cb(el); if (c) this.components.push(c); return this; }
  then(cb) { cb(this); return this; }
  clear() { this.controlEl.textContent = ""; this.components = []; return this; }
}
/* newer Obsidian: a titled group of settings */
class PluginSettingGroup {
  constructor(containerEl) {
    this.groupEl = document.createElement("div"); this.groupEl.className = "setting-group";
    this.headerEl = document.createElement("div"); this.headerEl.className = "setting-item setting-item-heading";
    this.listEl = document.createElement("div"); this.listEl.className = "setting-items";
    this.groupEl.appendChild(this.headerEl); this.groupEl.appendChild(this.listEl);
    containerEl.appendChild(this.groupEl);
  }
  setHeading(t) { this.headerEl.textContent = t; return this; }
  addSetting(cb) { const s = new PluginSetting(this.listEl); cb(s); return this; }
  addClass(c) { this.groupEl.classList.add(c); return this; }
}

class PluginSettingTab {
  constructor(app, plugin) {
    this.app = app;
    this.plugin = plugin;
    this.containerEl = document.createElement("div");
    this.containerEl.className = "vertical-tab-content";
  }
  display() {}
  hide() { this.containerEl.textContent = ""; }
}
