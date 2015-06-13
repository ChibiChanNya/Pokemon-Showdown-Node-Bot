/*
	Miscellaneous commands
*/

Settings.addPermissions(['pick', 'randomanswer', 'usage', 'help']);

exports.commands = {
	choose: 'pick',
	pick: function (arg, by, room, cmd) {
		var choices = arg.split(",");
		choices = choices.filter(function (i) {return (toId(i) !== '');});
		if (choices.length < 2) return this.pmReply(this.trad('err'));
		var choice = choices[Math.floor(Math.random() * choices.length)];
		if (!this.can('pick') || this.roomType === 'pm') {
			this.pmReply(Tools.stripCommands(choice));
		} else {
			this.reply(Tools.stripCommands(choice));
		}
	},

	'8ball': 'randomanswer',
	helix: 'randomanswer',
	randomanswer: function (arg, user, room) {
		if (room === user) return false;
		var text = '';
		var rand = ~~(20 * Math.random());
		var answers = this.trad('answers');
		text += (answers[rand] || answers[0]);
		this.restrictReply(text, 'randomanswer');
	},

	usagestats: 'usage',
	usage: function (arg, user, room) {
		this.restrictReply('http://www.smogon.com/stats/', 'usage');
	},

	guide: 'help',
	botguide: 'help',
	help: function (arg, user, room) {
		this.restrictReply('https://github.com/Ecuacion/Pokemon-Showdown-Node-Bot/blob/master/commands/README.md', 'help');
	}
};