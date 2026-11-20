#!/usr/bin/env python3
"""One-off migration: Jekyll templates/<lang>/*.md -> src/i18n/<lang>.json.

Run from site/: python3 scripts/migrate-templates.py
Text already translated on Crowdin is carried over; strings new to the Astro
site come from NEW_UI below (en is the Crowdin source). Safe to rerun: it
rebuilds every file from the templates.
"""
import json, re, pathlib

ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT = pathlib.Path(__file__).resolve().parents[1] / "src" / "i18n"
LANGS = ["ar", "de", "es", "fr", "hi", "it", "pt", "tr", "zh"]

FAQ_KEYS = ["what", "sorted", "inactive", "inactiveAccess", "exhaustive",
            "contribute", "maintainers", "discord", "report"]
RES_KEYS = ["taggart", "tryhackme", "bandit", "hackthebox", "gtfobins", "hacktricks",
            "awesomectf", "crackstation", "cyberchef", "dcode", "hackvertor",
            "explainshell", "hacktools", "pentestws", "revshells", "ss64",
            "infosechouse", "rawsec"]
RES_TYPE_OF = {"taggart": "education", "tryhackme": "handsOn", "bandit": "handsOn",
               "hackthebox": "handsOn", "gtfobins": "reference", "hacktricks": "reference",
               "awesomectf": "ctf", "crackstation": "ctf", "cyberchef": "ctf", "dcode": "ctf",
               "hackvertor": "ctf", "explainshell": "shell", "hacktools": "shell",
               "pentestws": "shell", "revshells": "shell", "ss64": "shell",
               "infosechouse": "resources", "rawsec": "resources"}


def clean(s: str) -> str:
    s = re.sub(r"<a [^>]*>.*?</a>", "", s)          # settings button in headings
    s = re.sub(r"\]\s+\(", "](", s)                  # "[pull request] (url)"
    # "[this](repo)" is not descriptive link text; name the repository instead.
    s = re.sub(r"\[[^\]]{1,6}\]\((https://github\.com/infosecstreams/infosecstreams\.github\.io)\)", r"[infosecstreams.github.io](\1)", s)
    s = re.sub(r"\((?:https://infosecstreams\.com)?/(?:" + "|".join(LANGS) + r")(/[a-z]*)?\)",
               lambda m: "(" + (m.group(1) or "/") + ")", s)  # language-neutral internal links
    return s.strip()


def blocks(md: str):
    """Yield (kind, text): kind is h1/h2/h3/p. Drops scripts, tables, liquid."""
    md = re.sub(r"<script.*?</script>", "", md, flags=re.S)
    for chunk in re.split(r"\n\s*\n", md):
        chunk = chunk.strip()
        if not chunk or chunk.startswith(("|", "<", "{%", "&nbsp;")) or "---" in chunk.split("\n")[-1]:
            continue
        m = re.match(r"^(#{1,3}) (.*)", chunk)
        if m:
            yield "h%d" % len(m.group(1)), clean(m.group(2))
        else:
            yield "p", clean(" ".join(chunk.split("\n")))


def parse_index(path):
    b = list(blocks(path.read_text()))
    out = {"title": b[0][1]}
    paras, i = [], 1
    while b[i][0] == "p":
        paras.append(b[i][1]); i += 1
    paras = [p for p in paras if "🟢" not in p]       # legend is now UI text
    out["intro"], out["inactiveNote"], out["questions"] = paras[:3]
    out["listHeading"] = b[i][1]
    rest = b[i + 1:]
    h3 = [j for j, (k, _) in enumerate(rest) if k == "h3"]
    sec = lambda n: [t for k, t in rest[h3[n] + 1:(h3[n + 1] if n + 1 < len(h3) else None)] if k == "p"]
    credits = {"heading": rest[h3[0]][1], "maintainer": sec(0)[0], "shoutout": sec(0)[1]}
    resources = {"heading": rest[h3[1]][1], "text": sec(1)[0]}
    contribute = {"heading": rest[h3[2]][1], "text": sec(2)[0]}
    return out, credits, resources, contribute


def parse_inactive(path):
    b = list(blocks(path.read_text()))
    return {"title": b[0][1], "intro": b[1][1], "listHeading": b[2][1]}


def parse_faq(path):
    b = list(blocks(path.read_text()))
    items, cur = {}, None
    for k, t in b[1:]:
        if k == "h2":
            cur = FAQ_KEYS[len(items)]
            items[cur] = {"q": t, "a": ""}
        elif k == "p" and cur:
            items[cur]["a"] = (items[cur]["a"] + "\n\n" + t).strip()
    assert len(items) == len(FAQ_KEYS), (path, len(items))
    return {"title": b[0][1], "items": items}


def parse_resources(path):
    text = path.read_text().replace("\\\\|", "\x00").replace("\\|", "\x00")
    b = [x for x in blocks(text) if x[0] != "p"]
    rows = []
    for line in text.splitlines():
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if cells and cells[0].startswith("[") and len(cells) >= 3:
            rows.append((cells[1].replace("\x00", "|"), cells[2]))
    assert len(rows) == len(RES_KEYS), (path, len(rows))
    items, types = {}, {}
    for key, (desc, typ) in zip(RES_KEYS, rows):
        items[key] = clean(desc)
        types.setdefault(RES_TYPE_OF[key], typ)
    return {"title": b[0][1], "heading": b[1][1], "types": types, "items": items}


CONFIG_DESC = {}
for m in re.finditer(r"- code: (\w+)\n\s+name: (.*)\n\s+description: \"(.*)\"", (ROOT / "_config.yml").read_text()):
    CONFIG_DESC[m.group(1)] = (m.group(2), m.group(3))

# Strings new to the Astro site. English is the Crowdin source; the others are
# first drafts for Crowdin translators to review. {n}/{name} are placeholders.
NEW_UI = {
 "en": {"tagline": "Who's streaming security right now: HackTheBox and TryHackMe boxes, red and blue team, CTFs, malware analysis.", "onNow": "On now", "showAll": "Show all {n}", "showLess": "Show less", "watch": "Watch on Twitch", "watching": "{n} watching", "livePreview": "Live preview of {name}'s stream", "topic": "Topic", "allTopics": "All topics", "nextUpLabel": "Next up", "colStatus": "Status", "colStreamer": "Streamer", "colActivity": "Activity", "colLinks": "Links", "liveSection": "Live now", "skip": "Skip to the list", "language": "Language", "home": "Streams", "inactiveNav": "Inactive", "faqNav": "FAQ", "resourcesNav": "Resources",
        "liveNow": "{n} live now", "nobodyLive": "Nobody is live right now.", "checking": "Checking who's live…", "unavailable": "Live status is unavailable right now. The full list is below.",
        "live": "Live", "prelive": "Getting ready", "offline": "Offline", "viewers": "{n} viewers", "hours30d": "{n} h streamed in 30 days",
        "search": "Search", "searchPlaceholder": "Search names, titles, categories", "allLanguages": "All languages", "allCategories": "All categories",
        "category": "Category", "liveOnly": "Live only", "clear": "Clear", "showing": "{shown} of {total}", "noMatches": "No streamers match these filters.",
        "upcoming": "Upcoming streams", "upcomingEmpty": "No scheduled streams in the next 7 days.", "addToCalendar": "Add to calendar", "noScript": "Turn on JavaScript to see who is live and the schedule.",
        "legendLive": "streaming now in an infosec category", "legendPrelive": "just switched to an infosec category; usually live within the hour",
        "onTwitch": "{name} on Twitch", "onYouTube": "{name} on YouTube", "source": "Source on GitHub", "addStreamer": "Add a streamer", "streamers": "{n} streamers", "keyHint": "Press / to search",
        "startsIn": "starts {t}", "nextUp": "Next up: {name}, {t}"},
 "de": {"tagline": "Wer gerade Security streamt: HackTheBox- und TryHackMe-Boxen, Red und Blue Team, CTFs, Malware-Analyse.", "onNow": "Jetzt", "showAll": "Alle {n} anzeigen", "showLess": "Weniger anzeigen", "watch": "Auf Twitch ansehen", "watching": "{n} schauen zu", "livePreview": "Live-Vorschau von {name}", "topic": "Thema", "allTopics": "Alle Themen", "nextUpLabel": "Als Nächstes", "colStatus": "Status", "colStreamer": "Streamer", "colActivity": "Aktivität", "colLinks": "Links", "liveSection": "Jetzt live", "skip": "Zur Liste springen", "language": "Sprache", "home": "Streams", "inactiveNav": "Inaktiv", "faqNav": "FAQ", "resourcesNav": "Ressourcen",
        "liveNow": "{n} jetzt live", "nobodyLive": "Gerade ist niemand live.", "checking": "Prüfe, wer live ist…", "unavailable": "Der Live-Status ist gerade nicht verfügbar. Die vollständige Liste steht unten.",
        "live": "Live", "prelive": "Gleich live", "offline": "Offline", "viewers": "{n} Zuschauer", "hours30d": "{n} Std. in 30 Tagen gestreamt",
        "search": "Suchen", "searchPlaceholder": "Namen, Titel, Kategorien suchen", "allLanguages": "Alle Sprachen", "allCategories": "Alle Kategorien",
        "category": "Kategorie", "liveOnly": "Nur live", "clear": "Zurücksetzen", "showing": "{shown} von {total}", "noMatches": "Keine Streamer passen zu diesen Filtern.",
        "upcoming": "Geplante Streams", "upcomingEmpty": "Keine geplanten Streams in den nächsten 7 Tagen.", "addToCalendar": "Zum Kalender hinzufügen", "noScript": "Aktiviere JavaScript, um zu sehen, wer live ist, und den Zeitplan.",
        "legendLive": "streamt gerade in einer Infosec-Kategorie", "legendPrelive": "hat gerade in eine Infosec-Kategorie gewechselt; meist innerhalb einer Stunde live",
        "onTwitch": "{name} auf Twitch", "onYouTube": "{name} auf YouTube", "source": "Quellcode auf GitHub", "addStreamer": "Streamer hinzufügen", "streamers": "{n} Streamer", "keyHint": "Drücke / zum Suchen",
        "startsIn": "beginnt {t}", "nextUp": "Als Nächstes: {name}, {t}"},
 "es": {"tagline": "Quién está emitiendo seguridad ahora: máquinas de HackTheBox y TryHackMe, red y blue team, CTFs, análisis de malware.", "onNow": "Ahora", "showAll": "Ver los {n}", "showLess": "Ver menos", "watch": "Ver en Twitch", "watching": "{n} viendo", "livePreview": "Vista previa en directo de {name}", "topic": "Tema", "allTopics": "Todos los temas", "nextUpLabel": "A continuación", "colStatus": "Estado", "colStreamer": "Streamer", "colActivity": "Actividad", "colLinks": "Enlaces", "liveSection": "En directo ahora", "skip": "Ir a la lista", "language": "Idioma", "home": "Streams", "inactiveNav": "Inactivos", "faqNav": "Preguntas", "resourcesNav": "Recursos",
        "liveNow": "{n} en directo ahora", "nobodyLive": "Nadie está en directo ahora mismo.", "checking": "Comprobando quién está en directo…", "unavailable": "El estado en directo no está disponible ahora. La lista completa está abajo.",
        "live": "En directo", "prelive": "Preparándose", "offline": "Desconectado", "viewers": "{n} espectadores", "hours30d": "{n} h emitidas en 30 días",
        "search": "Buscar", "searchPlaceholder": "Buscar nombres, títulos, categorías", "allLanguages": "Todos los idiomas", "allCategories": "Todas las categorías",
        "category": "Categoría", "liveOnly": "Solo en directo", "clear": "Limpiar", "showing": "{shown} de {total}", "noMatches": "Ningún streamer coincide con estos filtros.",
        "upcoming": "Próximos streams", "upcomingEmpty": "No hay streams programados en los próximos 7 días.", "addToCalendar": "Añadir al calendario", "noScript": "Activa JavaScript para ver quién está en directo y la programación.",
        "legendLive": "emitiendo ahora en una categoría de infosec", "legendPrelive": "acaba de cambiar a una categoría de infosec; suele empezar en menos de una hora",
        "onTwitch": "{name} en Twitch", "onYouTube": "{name} en YouTube", "source": "Código en GitHub", "addStreamer": "Añadir un streamer", "streamers": "{n} streamers", "keyHint": "Pulsa / para buscar",
        "startsIn": "empieza {t}", "nextUp": "A continuación: {name}, {t}"},
 "fr": {"tagline": "Qui streame la sécurité en ce moment : machines HackTheBox et TryHackMe, red et blue team, CTF, analyse de malware.", "onNow": "En ce moment", "showAll": "Voir les {n}", "showLess": "Voir moins", "watch": "Regarder sur Twitch", "watching": "{n} spectateurs", "livePreview": "Aperçu en direct de {name}", "topic": "Sujet", "allTopics": "Tous les sujets", "nextUpLabel": "À suivre", "colStatus": "Statut", "colStreamer": "Streamer", "colActivity": "Activité", "colLinks": "Liens", "liveSection": "En direct", "skip": "Aller à la liste", "language": "Langue", "home": "Streams", "inactiveNav": "Inactifs", "faqNav": "FAQ", "resourcesNav": "Ressources",
        "liveNow": "{n} en direct", "nobodyLive": "Personne n'est en direct pour le moment.", "checking": "Recherche des streams en direct…", "unavailable": "Le statut en direct est indisponible pour le moment. La liste complète est ci-dessous.",
        "live": "En direct", "prelive": "Se prépare", "offline": "Hors ligne", "viewers": "{n} spectateurs", "hours30d": "{n} h de stream en 30 jours",
        "search": "Rechercher", "searchPlaceholder": "Rechercher noms, titres, catégories", "allLanguages": "Toutes les langues", "allCategories": "Toutes les catégories",
        "category": "Catégorie", "liveOnly": "En direct seulement", "clear": "Effacer", "showing": "{shown} sur {total}", "noMatches": "Aucun streamer ne correspond à ces filtres.",
        "upcoming": "Streams à venir", "upcomingEmpty": "Aucun stream prévu dans les 7 prochains jours.", "addToCalendar": "Ajouter au calendrier", "noScript": "Activez JavaScript pour voir qui est en direct et le planning.",
        "legendLive": "en direct dans une catégorie infosec", "legendPrelive": "vient de passer dans une catégorie infosec ; en général en direct dans l'heure",
        "onTwitch": "{name} sur Twitch", "onYouTube": "{name} sur YouTube", "source": "Code source sur GitHub", "addStreamer": "Ajouter un streamer", "streamers": "{n} streamers", "keyHint": "Appuyez sur / pour rechercher",
        "startsIn": "commence {t}", "nextUp": "Prochain : {name}, {t}"},
 "it": {"tagline": "Chi sta trasmettendo sicurezza adesso: macchine HackTheBox e TryHackMe, red e blue team, CTF, analisi malware.", "onNow": "Adesso", "showAll": "Mostra tutti e {n}", "showLess": "Mostra meno", "watch": "Guarda su Twitch", "watching": "{n} spettatori", "livePreview": "Anteprima live di {name}", "topic": "Argomento", "allTopics": "Tutti gli argomenti", "nextUpLabel": "Prossimo", "colStatus": "Stato", "colStreamer": "Streamer", "colActivity": "Attività", "colLinks": "Link", "liveSection": "In diretta ora", "skip": "Vai all'elenco", "language": "Lingua", "home": "Stream", "inactiveNav": "Inattivi", "faqNav": "FAQ", "resourcesNav": "Risorse",
        "liveNow": "{n} in diretta ora", "nobodyLive": "Nessuno è in diretta in questo momento.", "checking": "Controllo chi è in diretta…", "unavailable": "Lo stato delle dirette non è disponibile al momento. L'elenco completo è qui sotto.",
        "live": "In diretta", "prelive": "In preparazione", "offline": "Offline", "viewers": "{n} spettatori", "hours30d": "{n} h di diretta in 30 giorni",
        "search": "Cerca", "searchPlaceholder": "Cerca nomi, titoli, categorie", "allLanguages": "Tutte le lingue", "allCategories": "Tutte le categorie",
        "category": "Categoria", "liveOnly": "Solo in diretta", "clear": "Azzera", "showing": "{shown} di {total}", "noMatches": "Nessuno streamer corrisponde a questi filtri.",
        "upcoming": "Prossimi stream", "upcomingEmpty": "Nessuno stream in programma nei prossimi 7 giorni.", "addToCalendar": "Aggiungi al calendario", "noScript": "Attiva JavaScript per vedere chi è in diretta e il programma.",
        "legendLive": "in diretta ora in una categoria infosec", "legendPrelive": "è appena passato a una categoria infosec; di solito va in diretta entro un'ora",
        "onTwitch": "{name} su Twitch", "onYouTube": "{name} su YouTube", "source": "Codice su GitHub", "addStreamer": "Aggiungi uno streamer", "streamers": "{n} streamer", "keyHint": "Premi / per cercare",
        "startsIn": "inizia {t}", "nextUp": "Prossimo: {name}, {t}"},
 "pt": {"tagline": "Quem está transmitindo segurança agora: máquinas do HackTheBox e TryHackMe, red e blue team, CTFs, análise de malware.", "onNow": "Agora", "showAll": "Ver todos os {n}", "showLess": "Ver menos", "watch": "Assistir na Twitch", "watching": "{n} assistindo", "livePreview": "Prévia ao vivo de {name}", "topic": "Tema", "allTopics": "Todos os temas", "nextUpLabel": "A seguir", "colStatus": "Status", "colStreamer": "Streamer", "colActivity": "Atividade", "colLinks": "Links", "liveSection": "Ao vivo agora", "skip": "Ir para a lista", "language": "Idioma", "home": "Streams", "inactiveNav": "Inativos", "faqNav": "Perguntas", "resourcesNav": "Recursos",
        "liveNow": "{n} ao vivo agora", "nobodyLive": "Ninguém está ao vivo agora.", "checking": "Verificando quem está ao vivo…", "unavailable": "O status ao vivo está indisponível agora. A lista completa está abaixo.",
        "live": "Ao vivo", "prelive": "Se preparando", "offline": "Offline", "viewers": "{n} espectadores", "hours30d": "{n} h transmitidas em 30 dias",
        "search": "Buscar", "searchPlaceholder": "Buscar nomes, títulos, categorias", "allLanguages": "Todos os idiomas", "allCategories": "Todas as categorias",
        "category": "Categoria", "liveOnly": "Só ao vivo", "clear": "Limpar", "showing": "{shown} de {total}", "noMatches": "Nenhum streamer corresponde a estes filtros.",
        "upcoming": "Próximas transmissões", "upcomingEmpty": "Nenhuma transmissão agendada nos próximos 7 dias.", "addToCalendar": "Adicionar ao calendário", "noScript": "Ative o JavaScript para ver quem está ao vivo e a programação.",
        "legendLive": "transmitindo agora em uma categoria de infosec", "legendPrelive": "acabou de mudar para uma categoria de infosec; geralmente entra ao vivo em até uma hora",
        "onTwitch": "{name} na Twitch", "onYouTube": "{name} no YouTube", "source": "Código no GitHub", "addStreamer": "Adicionar um streamer", "streamers": "{n} streamers", "keyHint": "Pressione / para buscar",
        "startsIn": "começa {t}", "nextUp": "A seguir: {name}, {t}"},
 "tr": {"tagline": "Şu anda güvenlik yayını yapanlar: HackTheBox ve TryHackMe makineleri, red ve blue team, CTF'ler, zararlı yazılım analizi.", "onNow": "Şimdi", "showAll": "{n} yayının hepsini göster", "showLess": "Daha az göster", "watch": "Twitch'te izle", "watching": "{n} izleyici", "livePreview": "{name} canlı önizleme", "topic": "Konu", "allTopics": "Tüm konular", "nextUpLabel": "Sıradaki", "colStatus": "Durum", "colStreamer": "Yayıncı", "colActivity": "Etkinlik", "colLinks": "Bağlantılar", "liveSection": "Şu anda canlı", "skip": "Listeye geç", "language": "Dil", "home": "Yayınlar", "inactiveNav": "Pasif", "faqNav": "SSS", "resourcesNav": "Kaynaklar",
        "liveNow": "Şu anda {n} canlı yayın", "nobodyLive": "Şu anda kimse canlı yayında değil.", "checking": "Canlı yayınlar kontrol ediliyor…", "unavailable": "Canlı durum şu anda alınamıyor. Tam liste aşağıda.",
        "live": "Canlı", "prelive": "Hazırlanıyor", "offline": "Çevrimdışı", "viewers": "{n} izleyici", "hours30d": "30 günde {n} saat yayın",
        "search": "Ara", "searchPlaceholder": "İsim, başlık, kategori ara", "allLanguages": "Tüm diller", "allCategories": "Tüm kategoriler",
        "category": "Kategori", "liveOnly": "Sadece canlı", "clear": "Temizle", "showing": "{total} içinden {shown}", "noMatches": "Bu filtrelere uyan yayıncı yok.",
        "upcoming": "Yaklaşan yayınlar", "upcomingEmpty": "Önümüzdeki 7 günde planlanmış yayın yok.", "addToCalendar": "Takvime ekle", "noScript": "Kimlerin canlı olduğunu ve programı görmek için JavaScript'i açın.",
        "legendLive": "şu anda bir infosec kategorisinde yayında", "legendPrelive": "az önce bir infosec kategorisine geçti; genellikle bir saat içinde yayına başlar",
        "onTwitch": "Twitch'te {name}", "onYouTube": "YouTube'da {name}", "source": "GitHub'da kaynak kod", "addStreamer": "Yayıncı ekle", "streamers": "{n} yayıncı", "keyHint": "Aramak için / tuşuna basın",
        "startsIn": "{t} başlıyor", "nextUp": "Sıradaki: {name}, {t}"},
 "zh": {"tagline": "现在谁在直播安全内容：HackTheBox 和 TryHackMe 靶机、红队与蓝队、CTF、恶意软件分析。", "onNow": "正在直播", "showAll": "显示全部 {n} 个", "showLess": "收起", "watch": "在 Twitch 观看", "watching": "{n} 人观看", "livePreview": "{name} 的直播预览", "topic": "主题", "allTopics": "所有主题", "nextUpLabel": "下一场", "colStatus": "状态", "colStreamer": "主播", "colActivity": "动态", "colLinks": "链接", "liveSection": "正在直播", "skip": "跳到列表", "language": "语言", "home": "直播", "inactiveNav": "不活跃", "faqNav": "常见问题", "resourcesNav": "资源",
        "liveNow": "{n} 人正在直播", "nobodyLive": "现在没有人在直播。", "checking": "正在检查谁在直播…", "unavailable": "暂时无法获取直播状态。完整列表在下方。",
        "live": "直播中", "prelive": "准备开播", "offline": "离线", "viewers": "{n} 名观众", "hours30d": "30 天内直播 {n} 小时",
        "search": "搜索", "searchPlaceholder": "搜索主播、标题、分类", "allLanguages": "所有语言", "allCategories": "所有分类",
        "category": "分类", "liveOnly": "仅看直播中", "clear": "清除", "showing": "{shown} / {total}", "noMatches": "没有符合筛选条件的主播。",
        "upcoming": "即将开始的直播", "upcomingEmpty": "未来 7 天没有已排期的直播。", "addToCalendar": "添加到日历", "noScript": "启用 JavaScript 以查看谁在直播和直播日程。",
        "legendLive": "正在信息安全分类下直播", "legendPrelive": "刚切换到信息安全分类，通常一小时内开播",
        "onTwitch": "{name} 的 Twitch", "onYouTube": "{name} 的 YouTube", "source": "GitHub 源代码", "addStreamer": "添加主播", "streamers": "{n} 位主播", "keyHint": "按 / 搜索",
        "startsIn": "{t}开始", "nextUp": "下一场：{name}，{t}"},
 "hi": {"tagline": "अभी कौन सिक्योरिटी स्ट्रीम कर रहा है: HackTheBox और TryHackMe मशीनें, रेड और ब्लू टीम, CTF, मालवेयर विश्लेषण।", "onNow": "अभी", "showAll": "सभी {n} दिखाएं", "showLess": "कम दिखाएं", "watch": "Twitch पर देखें", "watching": "{n} देख रहे हैं", "livePreview": "{name} का लाइव प्रीव्यू", "topic": "विषय", "allTopics": "सभी विषय", "nextUpLabel": "अगला", "colStatus": "स्थिति", "colStreamer": "स्ट्रीमर", "colActivity": "गतिविधि", "colLinks": "लिंक", "liveSection": "अभी लाइव", "skip": "सूची पर जाएं", "language": "भाषा", "home": "स्ट्रीम्स", "inactiveNav": "निष्क्रिय", "faqNav": "FAQ", "resourcesNav": "संसाधन",
        "liveNow": "अभी {n} लाइव", "nobodyLive": "अभी कोई लाइव नहीं है।", "checking": "देख रहे हैं कि कौन लाइव है…", "unavailable": "लाइव स्थिति अभी उपलब्ध नहीं है। पूरी सूची नीचे है।",
        "live": "लाइव", "prelive": "तैयारी में", "offline": "ऑफ़लाइन", "viewers": "{n} दर्शक", "hours30d": "30 दिनों में {n} घंटे स्ट्रीम",
        "search": "खोजें", "searchPlaceholder": "नाम, शीर्षक, श्रेणी खोजें", "allLanguages": "सभी भाषाएं", "allCategories": "सभी श्रेणियां",
        "category": "श्रेणी", "liveOnly": "केवल लाइव", "clear": "साफ़ करें", "showing": "{total} में से {shown}", "noMatches": "इन फ़िल्टर से कोई स्ट्रीमर मेल नहीं खाता।",
        "upcoming": "आने वाली स्ट्रीम्स", "upcomingEmpty": "अगले 7 दिनों में कोई स्ट्रीम निर्धारित नहीं है।", "addToCalendar": "कैलेंडर में जोड़ें", "noScript": "कौन लाइव है और शेड्यूल देखने के लिए JavaScript चालू करें।",
        "legendLive": "अभी एक infosec श्रेणी में स्ट्रीम कर रहे हैं", "legendPrelive": "अभी-अभी infosec श्रेणी में आए हैं; आमतौर पर एक घंटे में लाइव होते हैं",
        "onTwitch": "Twitch पर {name}", "onYouTube": "YouTube पर {name}", "source": "GitHub पर सोर्स", "addStreamer": "स्ट्रीमर जोड़ें", "streamers": "{n} स्ट्रीमर्स", "keyHint": "खोजने के लिए / दबाएं",
        "startsIn": "{t} शुरू", "nextUp": "अगला: {name}, {t}"},
 "ar": {"tagline": "من يبث محتوى الأمن الآن: أجهزة HackTheBox وTryHackMe، الفريق الأحمر والأزرق، تحديات CTF، تحليل البرمجيات الخبيثة.", "onNow": "الآن", "showAll": "عرض الكل ({n})", "showLess": "عرض أقل", "watch": "شاهد على Twitch", "watching": "{n} يشاهدون", "livePreview": "معاينة مباشرة لبث {name}", "topic": "الموضوع", "allTopics": "كل المواضيع", "nextUpLabel": "التالي", "colStatus": "الحالة", "colStreamer": "صانع المحتوى", "colActivity": "النشاط", "colLinks": "الروابط", "liveSection": "مباشر الآن", "skip": "انتقل إلى القائمة", "language": "اللغة", "home": "البث", "inactiveNav": "غير النشط", "faqNav": "الأسئلة الشائعة", "resourcesNav": "الموارد",
        "liveNow": "{n} في بث مباشر الآن", "nobodyLive": "لا أحد في بث مباشر الآن.", "checking": "جارٍ التحقق من البث المباشر…", "unavailable": "حالة البث المباشر غير متاحة الآن. القائمة الكاملة أدناه.",
        "live": "مباشر", "prelive": "يستعد", "offline": "غير متصل", "viewers": "{n} مشاهد", "hours30d": "{n} ساعة بث في 30 يومًا",
        "search": "بحث", "searchPlaceholder": "ابحث في الأسماء والعناوين والفئات", "allLanguages": "كل اللغات", "allCategories": "كل الفئات",
        "category": "الفئة", "liveOnly": "المباشر فقط", "clear": "مسح", "showing": "{shown} من {total}", "noMatches": "لا يوجد بث يطابق هذه المرشحات.",
        "upcoming": "البث القادم", "upcomingEmpty": "لا يوجد بث مجدول في الأيام السبعة القادمة.", "addToCalendar": "أضف إلى التقويم", "noScript": "فعّل JavaScript لرؤية من يبث مباشرة والجدول.",
        "legendLive": "يبث الآن في فئة أمن المعلومات", "legendPrelive": "انتقل للتو إلى فئة أمن المعلومات؛ يبدأ البث عادة خلال ساعة",
        "onTwitch": "{name} على Twitch", "onYouTube": "{name} على YouTube", "source": "الشيفرة على GitHub", "addStreamer": "أضف بثًا", "streamers": "{n} صانع محتوى", "keyHint": "اضغط / للبحث",
        "startsIn": "يبدأ {t}", "nextUp": "التالي: {name}، {t}"},
}


def build(lang, tdir, faq_path, res_path):
    home, credits, resources_blurb, contribute = parse_index(tdir / "index.tmpl.md")
    name, desc = CONFIG_DESC[lang]
    return {
        "meta": {"languageName": name, "description": desc},
        "ui": NEW_UI[lang],
        "home": home,
        "inactive": parse_inactive(tdir / "inactive.tmpl.md"),
        "credits": credits,
        "resourcesBlurb": resources_blurb,
        "contribute": contribute,
        "faq": parse_faq(faq_path),
        "resources": parse_resources(res_path),
    }


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    t = ROOT / "templates"
    docs = {"en": build("en", t, ROOT / "faq.md", ROOT / "resources.md")}
    for lang in LANGS:
        docs[lang] = build(lang, t / lang, t / lang / "faq.md", t / lang / "resources.md")
    for lang, doc in docs.items():
        (OUT / f"{lang}.json").write_text(json.dumps(doc, ensure_ascii=False, indent=2) + "\n")
    print("wrote", ", ".join(sorted(docs)))


main()
