const Task = require('./task');
const {TaskName} = require('../utils/constants');
const errBadInstruction = new Error('malformed jambonz application payload');

function makeTask(logger, obj, parent) {
  const keys = Object.keys(obj);
  if (!keys || keys.length !== 1) {
    throw errBadInstruction;
  }
  const name = keys[0];
  const data = obj[name];
  //logger.debug(data, `makeTask: ${name}`);
  if (typeof data !== 'object') {
    throw errBadInstruction;
  }
  Task.validate(name, data);
  switch (name) {
    case TaskName.SipDecline:
      const TaskSipDecline = require('./sip_decline');
      return new TaskSipDecline(logger, data, parent);
    case TaskName.Dial:
      logger.debug({data}, 'Dial verb');
      if (data.target && data.target.length === 1 && data.target[0].type === 'conference') {
        const TaskConference = require('./conference');
        return new TaskConference(logger, data, parent);
      }
      const TaskDial = require('./dial');
      return new TaskDial(logger, data, parent);
    case TaskName.Hangup:
      const TaskHangup = require('./hangup');
      return new TaskHangup(logger, data, parent);
    case TaskName.Say:
      /*
      if (data.synthesizer.vendor === 'google' && !data.synthesizer.language) {
        logger.debug('creating legacy say task');
        const TaskSayLegacy = require('./say-legacy');
        return new TaskSayLegacy(logger, data, parent);
      }
      */
      const TaskSay = require('./say');
      return new TaskSay(logger, data, parent);
    case TaskName.Play:
      const TaskPlay = require('./play');
      return new TaskPlay(logger, data, parent);
    case TaskName.Pause:
      const TaskPause = require('./pause');
      return new TaskPause(logger, data, parent);
    case TaskName.Gather:
      const TaskGather = require('./gather');
      return new TaskGather(logger, data, parent);
    case TaskName.Transcribe:
      const TaskTranscribe = require('./transcribe');
      return new TaskTranscribe(logger, data, parent);
    case TaskName.Listen:
      const TaskListen = require('./listen');
      return new TaskListen(logger, data, parent);
    case TaskName.Redirect:
      const TaskRedirect = require('./redirect');
      return new TaskRedirect(logger, data, parent);
    case TaskName.RestDial:
      const TaskRestDial = require('./rest_dial');
      return new TaskRestDial(logger, data, parent);
    case TaskName.Tag:
      const TaskTag = require('./tag');
      return new TaskTag(logger, data, parent);
  }

  // should never reach
  throw new Error(`invalid jambonz verb '${name}'`);
}

module.exports = makeTask;
