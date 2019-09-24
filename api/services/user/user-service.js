const User = require('../../models/user')
const codeService = require('../code/code-service')
const emailService = require('../email/email-service')
const oAuthService = require('../oauth/oauth-service')
const validateUserExists = require('./validation/validate-user-exists')
const validateUserToken = require('./validation/validate-user-token')
const validatePasswordIsConfirmed = require('./validation/validate-password-is-confirmed')
const validatePasswordsMatch = require('./validation/validate-passwords-match')
const validateActivationCode = require('./validation/validate-activation-code')
const UserFilter = require('./user-filter')

class UserService {
  // base methods - START
  async get (filter) {
    const userFilter = new UserFilter({
      id: filter.id,
      username: filter.username,
      email: filter.email
    })
      .getFilter()
    const record = await User
      .findOne(userFilter)
      .select('+password')
      .exec()
    return record
  }

  async create (data) {
    let record = new User(data)
    record = await record.save()
    return record
  }

  async update (id, update) {
    const userFilter = new UserFilter({
      id
    })
      .getFilter()
    const options = {
      new: true
    }
    const record = await User
      .findOneAndUpdate(userFilter, update, options)
    return record
  }

  async delete (id) {
    const userFilter = new UserFilter({
      id
    })
      .getFilter()
    const result = await User
      .deleteOne(userFilter)
      .exec()
    return result
  }

  // base methods - END

  async register (data) {
    let oauth = null
    if (data.oauthId) {
      oauth = await oAuthService.get(null, data.oauthId)
      data.email = oauth.email.toLowerCase()
      data.is_active = true
      delete data.oauthId
    }
    const user = await this.create(data)
    if (oauth) {
      await oAuthService.link(user._id, oauth._id)
    }
    if (!data.is_active) {
      await codeService.generateCode(user, 'user_activation')
    }
    return user
  }

  async updatePerson (id, person) {
    const update = {
      $set: {
        person
      }
    }
    const record = await this.update(id, update)
    return record
  }

  async updatePassword (username, token, password, passwordConfirm) {
    validatePasswordIsConfirmed(password, passwordConfirm)
    let user = await this.get({
      username
    })
    validateUserExists(user)
    const code = await codeService.get(user.username, 'password_reset', token)
    validateActivationCode(code)
    const update = {
      $set: {
        password
      }
    }
    user = await this.update(user._id, update)
    await emailService.send(user._id, {
      to: user.email,
      subject: 'Password was successfully reset',
      template: 'password-reset-success.hbs',
      model: {
        name: user.username
      }
    })
    return user
  }

  async activate (username, token) {
    let user = await this.get({
      username
    })
    validateUserExists(user)
    const code = await codeService.get(user.username, 'user_activation', token)
    validateActivationCode(code)
    const update = {
      is_active: true
    }
    user = await this.update(user._id, update)
    await emailService.send(user._id, {
      to: user.email,
      subject: 'Account was successfully activated',
      template: 'user-activation-success.hbs',
      model: {
        name: user.username
      }
    })
    return user
  }

  async reset (username, type) {
    const user = await this.get({
      username
    })
    validateUserExists(user)
    const code = await codeService.generateCode(user, type)
    return code
  }

  async login (username, password) {
    const user = await this.get({
      username
    })
    validateUserExists(user)
    await validatePasswordsMatch(user, password)
    return user
  }

  async verify (user) {
    const userFromDb = await this.get({
      username: user.username
    })
    validateUserToken(user, userFromDb)
    return user
  }
}

module.exports = new UserService()