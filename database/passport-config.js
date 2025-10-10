const LocalStrategy = require('passport-local').Strategy;
const bcrypt = require('bcryptjs');

function initialise(passport, getUserByUsername, getUserById) {
    const authenticateUser = async (username, password, done) => {
        const user = getUserByUsername(username);
        if (!user) {
            return done(null, false, { message: 'No user with that username.' });
        }

        try {
            if (await bcrypt.compare(password, user.password)) {
                return done(null, user);
            } else {
                return done(null, false, { message: 'Incorrect password.' });
            }
        } catch (err) {
            return done(err);
        }
    };

    // use "username" field
    passport.use(new LocalStrategy({ usernameField: 'username' }, authenticateUser));

    passport.serializeUser((user, done) => {
        done(null, user.id); // store user.id in the session
    });

    passport.deserializeUser((id, done) => {
        const user = getUserById(id);
        done(null, user);
    });
}

module.exports = initialise;
