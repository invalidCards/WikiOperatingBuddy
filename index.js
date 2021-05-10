const Discord = require('discord.js');
const bot = new Discord.Client();
const config = require('./config.json');
const needle = require('needle');

const regexLink = /\[\[(.+?)(\|.*?)?\]\]/g;
const regexTemp = /\{\{(.+?)(\|.*?)?\}\}/g;
const regexRaw  = /--(.+?)(\|.*?)?--/g;

const TYPE_NORMAL = 'normal';
const TYPE_TEMPLATE = 'template';
const TYPE_RAW = 'raw';

var wikis = require('./_wikis.json');
const db = require('better-sqlite3')('_prefs.db');

function handleSendError(e){
    switch(e.message){
        case "Missing Permissions":
            this.channel.send("Sorry, I couldn't respond to your message. I need the `Embed links` permission to function properly").catch(()=>{}) //Try to send a message without an embed, if it fails to send, don't care ¯\_(ツ)_/¯
            break;
        case "Invalid Form Body": //Happens, when we make a mistake and try to send too much
            this.channel.send("Due to an internal error the message failed to send\nIf this keeps happening, please report this").catch(()=>{})
            break;
        default:
            this.channel.send("An unexpected error occurred while trying to respond ("+e.message+")\nTry again later. If this keeps happening, please report this").catch(()=>{})
            break;
    }
}

bot.once('ready', () => {
    db.prepare('CREATE TABLE IF NOT EXISTS guilds (GuildID TEXT NOT NULL PRIMARY KEY, WikiKey TEXT NOT NULL)').run();
    db.prepare('CREATE TABLE IF NOT EXISTS channels (ChannelID TEXT NOT NULL PRIMARY KEY, WikiKey TEXT NOT NULL)').run();
    db.prepare('CREATE TABLE IF NOT EXISTS users (UserID TEXT NOT NULL PRIMARY KEY, DisabledLinks TEXT)').run();
    bot.user.setActivity(`Nindies | ${config.prefix}help`, {type: 'PLAYING'});
    console.log(`Ready at ${new Date().toUTCString()} - ${bot.guilds.cache.size} guilds, ${bot.channels.cache.size} channels, ${bot.users.cache.size} users`);
});

bot.on('message', async msg => {
    if (msg.author.bot) {
        return;
    }
    if (msg.cleanContent.startsWith(config.prefix)) {
        let [cmd, ...args] = msg.cleanContent.split(' ');
        switch (cmd.replace(config.prefix, '')) {
            case 'serverWiki': {
                if (msg.channel.type !== 'dm' && !msg.member.hasPermission('ADMINISTRATOR') && msg.user.id !== config.adminId) {
                    return;
                }

                if (msg.channel.type === 'dm') {
                    msg.channel.send('Please use `channelWiki` to set the preferred wiki for our private conversations!').catch(handleSendError.bind(msg));
                    return;
                }

                let wikiKey = realWikiName(args.join(' '));
                if (wikiKey) {
                    try {
                        db.prepare('INSERT INTO guilds (GuildID, WikiKey) VALUES(?, ?) ON CONFLICT(GuildID) DO UPDATE SET WikiKey=excluded.WikiKey').run(msg.guild.id, wikiKey);
                        msg.channel.send(`The wiki for this server has been successfully set to **${getWikiObj(wikiKey).name}**!`).catch(handleSendError.bind(msg));
                    } catch(e) {
                        msg.channel.send('Sorry, something went wrong. Please try again. If the issue persists, please contact invalidCards#0380 with a description of your issue.').catch(handleSendError.bind(msg));
                        console.error(e);
                    }
                } else {
                    msg.channel.send(`Sorry, I did not recognise the wiki **${args.join(' ')}**. Please make sure you typed it correctly and try again. For a full list, use *${config.prefix}list*.`).catch(handleSendError.bind(msg));
                }
                break;
            }
            case 'channelWiki': {
                if (msg.channel.type !== 'dm' && !msg.member.hasPermission('ADMINISTRATOR') && msg.user.id !== config.adminId) {
                    return;
                }

                if (msg.channel.type !== 'dm') {
                    let serverRow = db.prepare('SELECT * FROM guilds WHERE GuildID=?').get(msg.guild.id);
                    if (!serverRow) {
                        msg.channel.send(`Please set the default wiki for the guild first with *${config.prefix}serverWiki*.`).catch(handleSendError.bind(msg));
                    }
                }

                if (args.join(' ') === 'default') {
                    if (msg.channel.type === 'dm') {
                        msg.channel.send(`Sorry, you can't remove the set wiki of a private conversation. You can still change it with this command - for a full list, use *${config.prefix}list*.`).catch(handleSendError.bind(msg));
                        return;
                    }
                    try {
                        db.prepare('DELETE FROM channels WHERE ChannelID=?').run(msg.channel.id);
                        msg.channel.send('The wiki for this channel has been reset to the default for the server.').catch(handleSendError.bind(msg));
                    } catch(e) {
                        msg.channel.send('Sorry, something went wrong. Please try again. If the issue persists, please contact invalidCards#0380 with a description of your issue.').catch(handleSendError.bind(msg));
                        console.error(e);
                    }
                } else {
                    let wikiKey = realWikiName(args.join(' '));
                    if (wikiKey) {
                        try {
                            db.prepare('INSERT INTO channels (ChannelID, WikiKey) VALUES (?, ?) ON CONFLICT(ChannelID) DO UPDATE SET WikiKey=excluded.WikiKey').run(msg.channel.id, wikiKey);
                            msg.channel.send(`The wiki for this channel has been successfully set to **${getWikiObj(wikiKey).name}**!`).catch(handleSendError.bind(msg));
                        } catch(e) {
                            msg.channel.send('Sorry, something went wrong. Please try again. If the issue persists, please contact invalidCards#0380 with a description of your issue.').catch(handleSendError.bind(msg));
                            console.error(e);
                        }
                    } else {
                        msg.channel.send(`Sorry, I did not recognise the wiki **${args.join(' ')}**. Please make sure you typed it correctly and try again. For a full list, use *${config.prefix}list*.`).catch(handleSendError.bind(msg));
                    }
                }
                break;
            }
            case 'reloadWikis': {
                if (msg.author.id !== config.adminId) {
                    return;
                }
                delete require.cache[require.resolve('./_wikis.json')];
                wikis = require('./_wikis.json');
                msg.channel.send('Wiki JSON reloaded from file!').catch(handleSendError.bind(msg));
                break;
            }
            case 'list': {
                for (let embedCount = 0; embedCount < Math.ceil(wikis.length / 24); embedCount++) {
                    let embed = new Discord.MessageEmbed().setColor('#B22222').setTitle('Available wikis').setTimestamp();
                    if (embedCount === 0) {
                        embed.setDescription(`The following is a list of available wikis and their aliases. Both the full wiki name and all aliases can be used to set a wiki using \`${config.prefix}serverWiki\` and \`${config.prefix}clientWiki\`, as well as to make a one-time lookup to another wiki other than the default of the server or channel.`);
                    }
                    for (let i = 0; i < 24; i++) {
                        let wikiData = wikis[24*embedCount + i];
                        if (!wikiData) continue;
                        let aliases = Array.from(wikiData.aliases);
                        aliases.unshift(wikiData.key);
                        embed.addField(wikiData.name, aliases.join(', '), true);
                    }
                    if (embedCount === Math.ceil(wikis.length / 24) - 1) {
                        embed.addField('Unsupported wikis', `The following wikis are not supported by WOB:
• Hard Drop runs a very old version of MediaWiki, and its API is not compatible with the inner workings of this bot.`);
                    }
                    msg.channel.send(embed).catch(handleSendError.bind(msg));
                }
                break;
            }
            case 'help': {
                let embed = new Discord.MessageEmbed().setColor('#B22222').setTitle('WOB Help').setTimestamp();
                embed.addField('Commands', `
• \`${config.prefix}serverWiki <wiki>\` - sets the server's default wiki to the given wiki
• \`${config.prefix}channelWiki <wiki>\` - overrides the server's default wiki for the current channel
• \`${config.prefix}channelWiki default\` - removes a previously set override for the current channel
• \`${config.prefix}disable none|raw|all\` - prevent the bot from parsing specific types of (or all) wiki links from your messages
• \`${config.prefix}list\` - lists all available wikis and their aliases
• \`${config.prefix}help\` - display this help message`);

                embed.addField('Linking syntax', `
• \`[[search term]]\` - uses the API of the default wiki of the channel or server to find an existing page with the same name
• \`[[bp:search term]]\` - uses the API of a wiki that is not the default channel or server wiki (in this case Bulbapedia) to find an existing page with the same name (see \`${config.prefix}list\` for a full list of usable aliases)
• \`{{search term}}\` - uses the API (same as above) to find an existing template with the same name
• \`--search term--\` - creates a direct link to the search term, regardless of whether or not the page exists`);

                embed.addField('Feedback and suggestions', 'If you have any ideas, or features you are missing, please contact `invalidCards#0380` with your suggestion, and I will try to add it to the bot!');
                embed.addField('Code', 'The bot is fully open-source - you can look at [its GitHub repo](https://github.com/invalidCards/WikiOperatingBuddy) to see the complete inner workings!');
                msg.channel.send(embed).catch(handleSendError.bind(msg));
                break;
            }
            case 'disable': {
                if (!['all','raw','none'].includes(args[0])) {
                    msg.channel.send('Please supply one of the following values: `all`, `raw`, `none`.').catch(handleSendError.bind(msg));
                    return;
                }

                try {
                    db.prepare('INSERT INTO users (UserID, DisabledLinks) VALUES (?, ?) ON CONFLICT(UserID) DO UPDATE SET DisabledLinks=excluded.DisabledLinks').run(msg.author.id, args[0]);
                    let returnMessage = 'further messages you send will be parsed for all types of wiki links.';
                    if (args[0] === 'raw') returnMessage = 'further messages you send will not be parsed for raw links.';
                    else if (args[0] === 'all') returnMessage = 'none of your further messages will be parsed for wiki links.';
                    msg.reply(returnMessage);
                } catch(e) {
                    msg.channel.send('Sorry, something went wrong. Please try again. If the issue persists, please contact invalidCards#0380 with a description of your issue.').catch(handleSendError.bind(msg));
                    console.error(e);
                }
                break;
            }
        }
    } else {
        let userpref = db.prepare('SELECT * FROM users WHERE UserID=?').get(msg.author.id);
        if (userpref && userpref.DisabledLinks === 'all') {
            return;
        }
        let content = msg.cleanContent;
        content = content.replace(/```.*?```/gms, '');
        content = content.replace(/`.*?`/gms, '');
        content = content.replace(/https?[^ ]+?/gm, '');
        let links = [];
        if (content.search(regexLink) > -1) {
            let matches = Array.from(content.matchAll(regexLink), m => m[1]);
            for (let match of matches) {
                links.push({type: TYPE_NORMAL, query: match});
            }
        }
        if (content.search(regexTemp) > -1) {
            let matches = Array.from(content.matchAll(regexTemp), m => m[1]);
            for (let match of matches) {
                links.push({type: TYPE_TEMPLATE, query: match});
            }
        }
        if (content.search(regexRaw) > -1) {
            let matches = Array.from(content.matchAll(regexRaw), m => m[1]);
            for (let match of matches) {
                match = match.replace(/^[^a-zA-Z]+/g, '').trim();
                if (match === '') continue;
                links.push({type: TYPE_RAW, query: match});
            }
        }
        if (userpref && userpref.DisabledLinks === 'raw') {
            links = links.filter(l => l.type !== TYPE_RAW);
        }
        if (links.length) {
            let wiki = db.prepare('SELECT WikiKey FROM channels WHERE ChannelID=?').get(msg.channel.id);
            if (!wiki) {
                if (msg.channel.type === 'dm') {
                    msg.channel.send(`Our private conversation does not have a wiki set. Please use the *${config.prefix}channelWiki* command to set it up.`).catch(handleSendError.bind(msg));
                    return;
                }
                wiki = db.prepare('SELECT WikiKey FROM guilds WHERE GuildID=?').get(msg.guild.id);
                if (!wiki) {
                    msg.channel.send(`This server doesn't have a default wiki set yet. If you are an admin, use *${config.prefix}serverWiki* to set one. If you're not, go yell at one.`).catch(handleSendError.bind(msg));
                    return;
                } else {
                    wiki = wiki.WikiKey;
                }
            } else {
                wiki = wiki.WikiKey;
            }
            let messageContent = '**Wiki links detected:**';
            for (let linkData of links) {
                if (linkData.query.includes(':')) {
                    let [altWiki, ...actualQuery] = linkData.query.split(':');
                    if (!actualQuery[0]) {
                        actualQuery = ['Main Page'];
                    }
                    altWiki = altWiki.toLowerCase();
                    if (realWikiName(altWiki)) {
                        let wikiLink = '';
                        switch (linkData.type) {
                            case TYPE_NORMAL:
                                wikiLink = await fetchLink(altWiki, actualQuery.join(':'));
                                break;
                            case TYPE_TEMPLATE:
                                wikiLink = await fetchLink(altWiki, `Template:${actualQuery.join(':')}`);
                                break;
                            case TYPE_RAW:
                                wikiLink = fetchRawLink(altWiki, actualQuery.join(':'));
                                break;
                        }
                        if (wikiLink) {
                            messageContent += `\n<${wikiLink}>`;
                        }
                        continue;
                    }
                }
                if (!linkData.query) {
                    linkData.query = 'Main Page';
                }
                let wikiLink = '';
                switch (linkData.type) {
                    case TYPE_NORMAL:
                        wikiLink = await fetchLink(wiki, linkData.query);
                        break;
                    case TYPE_TEMPLATE:
                        wikiLink = await fetchLink(wiki, `Template:${linkData.query}`);
                        break;
                    case TYPE_RAW:
                        wikiLink = fetchRawLink(wiki, linkData.query);
                        break;
                }
                if (wikiLink) {
                    messageContent += `\n<${wikiLink}>`;
                }
            }
            if (messageContent.split('\n').length > 1) {
                msg.channel.send(messageContent).catch(handleSendError.bind(msg));
            }
        }
    }
});

const realWikiName = (abbreviation) => {
    abbreviation = abbreviation.toLowerCase();
    let wiki = wikis.filter(w => w.key.toLowerCase() === abbreviation);
    if (wiki.length) return wiki[0].key;
    wiki = wikis.filter(w => w.name.toLowerCase() === abbreviation);
    if (wiki.length) return wiki[0].key;
    wiki = wikis.filter(w => w.aliases.map(a => a.toLowerCase()).includes(abbreviation));
    if (wiki.length) return wiki[0].key;
    return false;
};

const getWikiObj = (wikiName) => {
    let wiki = wikis.filter(w => w.key === realWikiName(wikiName));
    if (wiki.length) return wiki[0];
};

const getWikiBaseUrl = (wikiName) => {
    let wiki = wikis.filter(w => w.key === realWikiName(wikiName));
    if (wiki.length) return wiki[0].url;
};

const getWikiArticleUrl = (wikiName) => {
    let wiki = wikis.filter(w => w.key === realWikiName(wikiName));
    if (wiki.length) return wiki[0].articleUrl;
}

const fetchLink = async (wikiName, article) => {
    article = article.replace(/ /g, '_');
    let response = await needle('get', `${getWikiBaseUrl(wikiName)}/api.php?action=opensearch&search=${encodeURI(article)}&limit=1&redirects=resolve`);
    if (!response.body[1].length) return await fetchLinkBackup(wikiName, article);
    return response.body[3][0];
};

const fetchLinkBackup = async (wikiName, article) => {
    let response = await needle('get', `${getWikiBaseUrl(wikiName)}/api.php?action=query&list=search&srsearch=${encodeURI(article)}&srnamespace=*&srlimit=1&format=json`);
    if (response.body.query.searchinfo.totalhits === 0) return false;
    return `${getWikiArticleUrl(wikiName)}/${encodeURI(response.body.query.search[0].title.replace(/ /g, '_'))}`
}

const fetchRawLink = (wikiName, article) => {
    return `${getWikiArticleUrl(wikiName)}/${encodeURI(article)}`;
};

bot.login(config.token);
