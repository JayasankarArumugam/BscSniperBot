"use strict";
const env = require("dotenv");
const result = env.config()
const inquirer = require('inquirer');

if (result.error) {
    throw result.error
}
const getToken = () => {
    inquirer.prompt([
        {
            type: 'input',
            name: 'getToken',
            message: 'Enter Token',
        },
    ])
        .then(answers => {
            return answers.token
        }
        );
}

module.exports = {
    getToken,
};