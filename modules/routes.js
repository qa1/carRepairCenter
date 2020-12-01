const express = require("express");
const router = express.Router();
const User = require("../models/User");
const passport = require("passport");
const { serializeError, deserializeError } = require("serialize-error");
const route = require("color-convert/route");
const async = require("async");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const config = require("./config");
const Customer = require("../models/Customers");
const Reception = require("../models/Reception");
const SequentalNumber = require("../models/sequentalNumbers");
const sequentalNumber = require("../models/sequentalNumbers");
const moment = require("jalali-moment");
/**---------------------------------------------------------
 * !Global Variables
 */
let status = {
  doing: "doing",
  rejected: "rejected",
  canceled: "canceled",
  dalayed: "dalayed",
  succeded: "succeded",
  returened: "returened",
};

/**---------------------------------------------------------
 * !Helper Methods
 */
//checks if user is exist and logged in?
isAuthenticated = (req, res, next) => {
  if (req.isAuthenticated()) {
    return next();
  }
  req.flash("error", "شما مجاز نیستید");
  res.redirect("/login");
};
isSaved = (req, res, next) => {
  if (req.isAuthenticated()) {
    return res.redirect("/dashboard");
  }
  next();
};

isToday = (d) => {
  let date = new Date(d);
  let today = new Date();
  return (
    today.getDate() === date.getDate() &&
    today.getMonth() === date.getMonth() &&
    today.getFullYear === date.getFullYear
  );
};
translateStatustoFarsi = (status) => {
  if (status === "doing") return "در حال انجام";
  if (status === "rejected") return "نا موفق";
  if (status === "canceled") return "کنسلی";
  if (status === "dalayed") return "با تاخیر";
  if (status === "succeded") return "تحویل شده";
  if (status === "returened") return "برگشتی";
};
/**---------------------------------------------------------
 * ?Routes
 * !GETs
 */
router.get("/", (req, res) => {
  res.render("index");
});
router.get("/dashboard", isAuthenticated, async (req, res) => {
  let date = new Date();
  let totalReceptions = 0;
  let todayTotalReceptions = 0;
  let doingCount = 0;
  let rejectedCount = 0;
  let returenedCount = 0;
  let returenedTodayCount = 0;
  let canceledCount = 0;
  let dalayedCount = 0;
  let succededCount = 0;
  await Reception.find({}).then((receptions) => {
    totalReceptions = receptions.length;

    //loop all receptions
    for (reception of receptions) {
      //check dates(reception_id)
      if (isToday(reception.reception_id)) {
        todayTotalReceptions++;
        returenedTodayCount++;
      }
      //check Status
      if (reception.status === "doing") {
        doingCount++;
      }
      if (reception.status === "rejected") {
        rejectedCount++;
      }
      if (reception.status === "canceled") {
        canceledCount++;
      }
      if (reception.status === "dalayed") {
        dalayedCount++;
      }
      if (reception.status === "succeded") {
        succededCount++;
      }
      if (reception.status === "returened") {
        returenedCount++;
      }
    }
  });
  res.render("dashboard", {
    name: req.user.name,
    totalReceptions: totalReceptions,
    todayTotalReceptions: todayTotalReceptions,
    doingCount: doingCount,
    rejectedCount: rejectedCount,
    canceledCount: canceledCount,
    dalayedCount: dalayedCount,
    succededCount: succededCount,
    returenedCount: returenedCount,
  });
});
router.get("/login", isSaved, (req, res) => {
  res.render("login");
});
router.get("/register", (req, res) => {
  res.render("register");
});
router.get("/logout", isAuthenticated, (req, res) => {
  req.logOut();
  req.flash("success", "با موفقیت خارج شدید");
  res.redirect("/login");
});
router.get("/forget", (req, res) => {
  res.render("forget");
});
router.get("/reset/:token", (req, res) => {
  let token = req.params.token;
  console.log(token);
  User.findOne({ token: token, tokenExpireDate: { $gt: Date.now() } })
    .then((user) => {
      if (!user) {
        req.flash("error", "توکن صحیح نیست یا تاریخ مصرف گذشته است");
        return res.redirect("/forget");
      }
      res.render("reset", { token: token });
    })
    .catch((err) => {
      req.flash("error", serializeError(err).message);
      return res.redirect("/forget");
    });
});
router.get("/changePassword", isAuthenticated, (req, res) => {
  res.render("changePassword", { name: req.user.name });
});
router.get("/customer/new", isAuthenticated, (req, res) => {
  res.render("customer-new", { name: req.user.name });
});
router.get("/reception/new", isAuthenticated, (req, res) => {
  res.render("reception-new", { name: req.user.name });
});
router.get("/reception/list", isAuthenticated, async (req, res) => {
  let receptions = [];
  let rs = [];
  await Reception.find({})
    .then((receptions) => {
      rs = receptions;
    })
    .catch((err) => {
      console.log("/reception-list:", serializeError(err).message);
      receptions = null;
      req.flash("error", "قادر به دریافت اطلاعات نیستیم");
      return res.render("reception-list", {
        name: req.user.name,
        receptions: receptions,
      });
    });

  await Promise.all(
    rs.map(async (reception) => {
      //reception Data-time to Jalali
      const date = new Date(reception.reception_id);
      const dateTime = new Intl.DateTimeFormat("en-US").format(date);
      //get jalali data (https://www.npmjs.com/package/jalali-moment)
      m = moment.from(dateTime, "en", "MM/DD/YYYY");
      let jDate = m.format("jYYYY/jMM/jDD");
      //makeing 2 digit hour and minute
      let time =
        (date.getHours() < 10 ? "0" : "") +
        date.getHours() +
        ":" +
        ((date.getMinutes() < 10 ? "0" : "") + date.getMinutes());
      reception["date"] = jDate;
      reception["time"] = time;
      //reception status
      reception["status"] = translateStatustoFarsi(reception.status);
      await Customer.findOne({ phoneNumber: reception.customerPhoneNumber })
        .then((customer) => {
          reception["customerName"] = customer.name;
          reception["customerLastname"] = customer.lastName;
          receptions.push(reception);
        })
        .catch((err) => {
          console.log("Customer.findone:", serializeError(err).message);
        });
    })
  );
  res.render("reception-list", { name: req.user.name, receptions: receptions });
});
router.get("/reception/edit/:id", (req, res) => {
  Reception.findOne({ _id: req.params.id })
    .then((reception) => {
      return res.render("reception-edit", {
        reception: reception,
        name: req.body.name,
      });
    })
    .catch((err) => {
      console.log("Error from Reception findOne:", err);
      req.flash("error", deserializeError(err).message);
      return res.redirect("/reception/list");
    });
});

/**---------------------------------------------------------
 * ?Routes
 * !POSTs
 */
router.post("/register", (req, res) => {
  if (req.body.password !== req.body.confirmPassword) {
    req.flash("error", "پسوردها یکسان نیستند");
    return res.redirect("/register");
  }
  User.register(
    { username: req.body.username, name: req.body.name, email: req.body.email },
    req.body.password
  )
    .then((user) => {
      req.flash("success", "ثبت نام انجام شد");
      res.redirect("/login");
    })
    .catch((err) => {
      req.flash("error", serializeError(err).message);
      res.redirect("/register");
    });
});
router.post(
  "/login",
  passport.authenticate("local", {
    successRedirect: "/dashboard",
    // successFlash: "با موفقیت وارد شدید",
    failureRedirect: "/login",
    failureFlash: true,
  })
);
router.post("/forget", (req, res) => {
  User.findOne({ email: req.body.email })
    .then((user) => {
      if (!user) {
        req.flash("error", "این ایمیل یافت نشد");
        res.redirect("/forget");
      }
      async.waterfall([
        (done) => {
          let token = crypto.randomBytes(20).toString("hex");
          //valid for 6 hours
          let tokenExpire = Date.now() + 1000 * 60 * 60 * 6;
          done(null, token, tokenExpire);
        },
        (token, tokenExpire, done) => {
          user.token = token;
          user.tokenExpireDate = tokenExpire;
          user
            .save()
            .then(() => {
              done(null, user, token);
            })
            .catch((err) => {
              req.flash("error", deserializeError(err).message);
              return res.redirect("/forget");
            });
        },
        (user, token, done) => {
          const transporter = nodemailer.createTransport({
            service: "gmail",
            auth: {
              user: config.GMAIL_USERNAME,
              pass: config.GMAIL_PASSWORD,
            },
          });

          const mailOptions = {
            from: "Peyman Khalili<p.zonouz@gmail.com>",
            to: user.email,
            subject: "Recovery",
            text:
              "با سلام. برای بازیابی کلمه عبور خود روی لینک زیر کلیک کنید\n\n http://localhost:5000/reset/" +
              token,
          };

          transporter
            .sendMail(mailOptions)
            .then(() => {
              req.flash("success", "ایمیل ارسال شد");
              res.redirect("/forget");
            })
            .catch((err) => {
              req.flash("error", deserializeError(err).message);
              return res.redirect("/forget");
            });
        },
      ]);
    })
    .catch((err) => {
      req.flash("error", serializeError(err).message);
      return res.redirect("/forget");
    });
});
router.post("/reset/:token", (req, res) => {
  let token = req.params.token;
  User.findOne({ token: token, tokenExpireDate: { $gt: Date.now() } })
    .then((user) => {
      if (!user) {
        req.flash("error", "توکن صحیح نیست یا تاریخ مصرف گذشته است");
        return res.redirect("/forget");
      }
      if (req.body.password !== req.body.confirmPassword) {
        req.flash("error", "پسوردها یکسان نیستند");
        return res.redirect("/reset/" + token);
      }
      let pass = req.body.password;
      user
        .setPassword(pass)
        .then((user) => {
          user.token = undefined;
          user.tokenExpireDate = undefined;
          user
            .save()
            .then(() => {
              req.flash("success", "پسورد با موفقیت تغییر یافت");
              return res.redirect("/login");
            })
            .catch((err) => {
              req.flash("error", serializeError(err).message);
              return res.redirect("/reset/" + token);
            });
        })
        .catch((err) => {
          req.flash("error", serializeError(err).message);
          return res.redirect("/reset/" + token);
        });
    })
    .catch((err) => {
      console.log("here");
      req.flash("error", serializeError(err).message);
      return res.redirect("/forget");
    });
});
router.post("/changePassword", isAuthenticated, (req, res) => {
  if (req.body.password !== req.body.confirmPassword) {
    req.flash("error", "پسوردها یکسان نیستند");
    return res.redirect("/changePassword");
  }
  req.user
    .changePassword(req.body.oldPassword, req.body.password)
    .then((user) => {
      req.flash("success", "پسورد با موفقیت تغییر یافت");
      req.logOut();
      res.redirect("/login");
    })
    .catch((err) => {
      req.flash("error", " پسورد فعلی اشتباه است");
      res.redirect("/changepassword");
    });
});
router.post("/customer/new", isAuthenticated, (req, res) => {
  Customer.findOne({
    phoneNumber: req.body.phoneNumber,
  }).then((customer) => {
    if (customer) {
      req.flash("error", "این شماره موبایل قبلا ثبت شده است");
      return res.redirect("/customer/new");
    }
  });
  Customer.create({
    name: req.body.name,
    lastName: req.body.lastName,
    phoneNumber: req.body.phoneNumber,
  })
    .then((customer) => {
      req.flash("success", "یک مشتری با موفقیت ایجاد شد");
      res.redirect("/customer/new");
    })
    .catch((err) => {
      req.flash("error", deserializeError(err).message);
      res.redirect("/customer/new");
    });
});
router.post("/reception/new", isAuthenticated, async (req, res) => {
  //setting by JS new features ECMA 6
  let {
    customerPhoneNumber,
    comments,
    vehicleName,
    license,
    VIN,
    mileage,
    situation,
    pricePrediction,
    prePaid,
    things,
    spare,
    jack,
    toolBox,
    light,
    audioPlayer,
    sunroofTool,
    manual,
    sideMirror,
    footStool,
    dangerTriangle,
    logo,
    cable,
    remote,
    hubcap,
    sportRing,
    traffic,
    siren,
    ashTray,
    fireExtinguisher,
    rearWiper,
    seatCover,
    wheelWrench,
    frontWiper,
    ringLock,
    antenna,
    lace,
  } = req.body;
  //try to remove , from numbers
  pricePrediction = pricePrediction.replace(/,/g, "");
  prePaid = prePaid.replace(/,/g, "");
  mileage = mileage.replace(/,/g, "");

  //req.body data but to checkboxs
  let date = new Date();
  let formData = {
    reception_id: date.toISOString(),
    status: status.doing,
    customerPhoneNumber: customerPhoneNumber,
    comments: comments,
    vehicleName: vehicleName,
    license: license,
    VIN: VIN,
    mileage: mileage,
    situation: situation,
    pricePrediction: pricePrediction,
    prePaid: prePaid,
    things: things,
    spare: spare,
    jack: jack,
    toolBox: toolBox,
    light: light,
    audioPlayer: audioPlayer,
    sunroofTool: sunroofTool,
    manual: manual,
    sideMirror: sideMirror,
    footStool: footStool,
    dangerTriangle: dangerTriangle,
    logo: logo,
    cable: cable,
    remote: remote,
    hubcap: hubcap,
    sportRing: sportRing,
    traffic: traffic,
    siren: siren,
    ashTray: ashTray,
    fireExtinguisher: fireExtinguisher,
    rearWiper: rearWiper,
    seatCover: seatCover,
    wheelWrench: wheelWrench,
    frontWiper: frontWiper,
    ringLock: ringLock,
    antenna: antenna,
    lace: lace,
  };

  await Reception.create(formData)
    .then((reception) => {
      req.flash("success", "پذیرش با موفقیت انجام شد");
      return res.redirect("/reception/new");
    })
    .catch((err) => {
      req.flash("error", deserializeError(err).message);
      return res.redirect("/reception/new");
    });
});
router.post("/reception/edit/:id", isAuthenticated, async (req, res) => {
  //setting by JS new features ECMA 6
  let {
    customerPhoneNumber,
    comments,
    vehicleName,
    license,
    VIN,
    mileage,
    situation,
    pricePrediction,
    prePaid,
    things,
    spare,
    jack,
    toolBox,
    light,
    audioPlayer,
    sunroofTool,
    manual,
    sideMirror,
    footStool,
    dangerTriangle,
    logo,
    cable,
    remote,
    hubcap,
    sportRing,
    traffic,
    siren,
    ashTray,
    fireExtinguisher,
    rearWiper,
    seatCover,
    wheelWrench,
    frontWiper,
    ringLock,
    antenna,
    lace,
  } = req.body;
  //try to remove , from numbers
  pricePrediction = pricePrediction.replace(/,/g, "");
  prePaid = prePaid.replace(/,/g, "");
  mileage = mileage.replace(/,/g, "");
  let date = new Date();
  // let modificationDate = date.now();
  //req.body data but to checkboxs
  let formData = {
    // reception_id: date.toISOString(),
    status: status.doing,
    customerPhoneNumber: customerPhoneNumber,
    comments: comments,
    vehicleName: vehicleName,
    license: license,
    VIN: VIN,
    mileage: mileage,
    situation: situation,
    pricePrediction: pricePrediction,
    prePaid: prePaid,
    things: things,
    spare: spare,
    jack: jack,
    toolBox: toolBox,
    light: light,
    audioPlayer: audioPlayer,
    sunroofTool: sunroofTool,
    manual: manual,
    sideMirror: sideMirror,
    footStool: footStool,
    dangerTriangle: dangerTriangle,
    logo: logo,
    cable: cable,
    remote: remote,
    hubcap: hubcap,
    sportRing: sportRing,
    traffic: traffic,
    siren: siren,
    ashTray: ashTray,
    fireExtinguisher: fireExtinguisher,
    rearWiper: rearWiper,
    seatCover: seatCover,
    wheelWrench: wheelWrench,
    frontWiper: frontWiper,
    ringLock: ringLock,
    antenna: antenna,
    lace: lace,
  };
  formData[
    `modification-${date.getFullYear()}-${date.getMonth()}-${date.getDate()}-${date.getHours()}-${date.getMinutes()}-${date.getSeconds()}`
  ] = date.toISOString();
  console.log(formData);
  await Reception.updateOne({ _id: req.params.id }, formData)
    .then(() => {
      req.flash("success", "ویرایش با موفقیت انجام شد");
      return res.redirect("/reception/edit/" + req.params.id);
    })
    .catch((err) => {
      console.log(err);
      req.flash("error", deserializeError(err).message);
      return res.redirect("/reception/edit/" + req.params.id);
    });
});
router.post("/ajax", isAuthenticated, (req, res) => {
  Customer.find({})
    .then((customers) => {
      res.send(customers);
    })
    .catch();
});
router.post("/reception/remove/:id", (req, res) => {
  console.log("Here");
});

module.exports = router;