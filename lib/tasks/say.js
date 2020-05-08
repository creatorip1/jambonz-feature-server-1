const Task = require('./task');
const {TaskName, TaskPreconditions} = require('../utils/constants');

class TaskSay extends Task {
  constructor(logger, opts, parentTask) {
    super(logger, opts);
    this.preconditions = TaskPreconditions.Endpoint;

    this.text = Array.isArray(this.data.text) ? this.data.text : [this.data.text];
    this.loop = this.data.loop || 1;
    this.earlyMedia = this.data.earlyMedia === true || (parentTask && parentTask.earlyMedia);
    if (this.data.synthesizer) {
      this.voice = this.data.synthesizer.voice;
      switch (this.data.synthesizer.vendor) {
        case 'google':
          this.ttsEngine = 'google_tts';
          break;
        default:
          throw new Error(`unsupported tts vendor ${this.data.synthesizer.vendor}`);
      }
    }
  }

  get name() { return TaskName.Say; }

  async exec(cs, ep) {
    const {srf} = cs;
    const {synthAudio} = srf.locals.dbHelpers;
    super.exec(cs);
    this.ep = ep;
    try {
      const filepath = [];
      while (!this.killed && this.loop--) {
        let segment = 0;
        do {
          if (filepath.length <= segment) {
            const opts = Object.assign({
              text: this.text[segment],
              vendor: cs.speechSynthesisVendor,
              language: cs.speechSynthesisLanguage,
              voice: cs.speechSynthesisVoice
            }, this.synthesizer);
            const path = await synthAudio(opts);
            filepath.push(path);
            cs.trackTmpFile(path);
          }
          await ep.play(filepath[segment]);
        } while (++segment < this.text.length);
      }
    } catch (err) {
      this.logger.info(err, 'TaskSay:exec error');
    }
    this.emit('playDone');
  }

  async kill() {
    super.kill();
    if (this.ep.connected) {
      this.logger.debug('TaskSay:kill - killing audio');
      await this.ep.api('uuid_break', this.ep.uuid).catch((err) => this.logger.info(err, 'Error killing audio'));
    }
  }
}

module.exports = TaskSay;
