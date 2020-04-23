const uuidv4 = require('uuid/v4');
const {CallDirection} = require('./utils/constants');
const CallInfo = require('./session/call-info');
const Requestor = require('./utils/requestor');
const makeTask = require('./tasks/make_task');
const normalizeJambones = require('./utils/normalize-jambones');

module.exports = function(srf, logger) {
  const {lookupAppByPhoneNumber, lookupAppBySid, lookupAppByRealm}  = srf.locals.dbHelpers;

  function initLocals(req, res, next) {
    const callSid = uuidv4();
    req.locals = {
      callSid,
      logger: logger.child({callId: req.get('Call-ID'), callSid})
    };
    if (req.has('X-Application-Sid')) {
      const application_sid = req.get('X-Application-Sid');
      req.locals.logger.debug(`got application from X-Application-Sid header: ${application_sid}`);
      req.locals.application_sid = application_sid;
    }
    if (req.has('X-Authenticated-User')) req.locals.originatingUser = req.get('X-Authenticated-User');

    next();
  }

  /**
   * Within the system, we deal with E.164 numbers _without_ the leading '+
   */
  function normalizeNumbers(req, res, next) {
    const logger = req.locals.logger;
    Object.assign(req.locals, {
      calledNumber: req.calledNumber,
      callingNumber: req.callingNumber
    });
    try {
      const regex = /^\+(\d+)$/;
      let arr = regex.exec(req.calledNumber);
      if (arr) req.locals.calledNumber = arr[1];
      arr = regex.exec(req.callingNumber);
      if (arr) req.locals.callingNumber = arr[1];
    } catch (err) {
      logger.error(err, `${req.get('Call-ID')} Error performing regex`);
    }
    next();
  }

  /**
   * Given the dialed DID/phone number, retrieve the application to invoke
   */
  async function retrieveApplication(req, res, next) {
    const logger = req.locals.logger;
    try {
      let app;
      if (req.locals.application_sid) app = await lookupAppBySid(req.locals.application_sid);
      else if (req.locals.originatingUser) {
        const arr = /^(.*)@(.*)/.exec(req.locals.originatingUser);
        if (arr) {
          const sipRealm = arr[2];
          logger.debug(`looking for device calling app for realm ${sipRealm}`);
          app = await lookupAppByRealm(sipRealm);
          if (app) logger.debug({app}, `retrieved device calling app for realm ${sipRealm}`);

        }
      }
      else app = await lookupAppByPhoneNumber(req.locals.calledNumber);

      if (!app || !app.call_hook || !app.call_hook.url) {
        logger.info(`rejecting call to ${req.locals.calledNumber}: no application or webhook url`);
        return res.send(480, {
          headers: {
            'X-Reason': 'no configured application'
          }
        });
      }

      /**
      * create a requestor that we will use for all http requests we make during the call.
      * also create a notifier for call status events (if not needed, its a no-op).
      */
      app.requestor = new Requestor(logger, app.call_hook);
      if (app.call_status_hook) app.notifier = new Requestor(logger, app.call_status_hook);
      else app.notifier = {request: () => {}};

      req.locals.application = app;
      const obj = Object.assign({}, app);
      delete obj.requestor;
      delete obj.notifier;
      logger.info({app: obj}, `retrieved application for incoming call to ${req.locals.calledNumber}`);
      req.locals.callInfo = new CallInfo({req, app, direction: CallDirection.Inbound});
      next();
    } catch (err) {
      logger.error(err, `${req.get('Call-ID')} Error looking up application for ${req.calledNumber}`);
      res.send(500);
    }
  }

  /**
   * Invoke the application callback and get the initial set of instructions
   */
  async function invokeWebCallback(req, res, next) {
    const logger = req.locals.logger;
    const app = req.locals.application;
    try {
      /* retrieve the application to execute for this inbound call */
      const params = Object.assign(app.call_hook.method === 'POST' ? {sip: req.msg} : {},
        req.locals.callInfo);
      const json = await app.requestor.request(app.call_hook, params);
      app.tasks = normalizeJambones(logger, json).map((tdata) => makeTask(logger, tdata));
      if (0 === app.tasks.length) throw new Error('no application provided');
      next();
    } catch (err) {
      logger.info(`Error retrieving or parsing application: ${err.message}`);
      res.send(480, {headers: {'X-Reason': err.message}});
    }
  }

  return {
    initLocals,
    normalizeNumbers,
    retrieveApplication,
    invokeWebCallback
  };
};
