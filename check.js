var wikis = require('./_wikis.json');

let keys = [];
for (let obj of wikis) {
    if (obj.url.endsWith('/') || obj.articleUrl.endsWith('/')) {
        console.error(`Wiki with key ${obj.key} has a URL ending with a slash. This is bad!`);
    }
    keys.push(obj.key.toLowerCase());
    keys.push(...obj.aliases.map(a => a.toLowerCase()));
}
let reserved = ['default', 'none', '-', 'mediawiki', 'help', 'template', 'talk', 'user', 'project', 'file', 'category', 'forum'];
keys.push(...reserved);

var duplicates = keys.reduce((acc, el, i, arr) => {
    if (arr.indexOf(el) !== i && acc.indexOf(el) < 0) acc.push(el); return acc;
}, []);

if (duplicates.length > 0) {
    let msg = 'Duplicate keys/aliases detected! Please resolve these before attempting to restart the bot.';
    for (let dupe of duplicates) {
        msg += `\n- Duplicate "${dupe}":`;
        let foundKeys = wikis.filter(w => w.key === dupe);
        for (let foundKey of foundKeys) {
            msg += `\n - Key of ${foundKey.name}`;
        }
        let foundAliases = wikis.filter(w => w.aliases.includes(dupe));
        for (let foundAlias of foundAliases) {
            msg += `\n - Alias of ${foundAlias.name} (${foundAlias.aliases.filter(a => a === dupe).length} time(s))`;
        }
        if (reserved.includes(dupe)) {
            msg += '\n - Built-in reserved keyword';
        }
    }
    console.error(msg);
    process.exit(-1);
} else {
    console.log('Success!');
}
