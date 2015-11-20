CREATE TABLE `Auth` (
  `key` varchar(100) NOT NULL,
  `value` varchar(5000) DEFAULT NULL,
  `count` int(11) NOT NULL DEFAULT '1',
  PRIMARY KEY (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE `CheckboxMapping` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `noteId` varchar(45) NOT NULL,
  `label` varchar(45) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `index2` (`noteId`,`label`)
) ENGINE=InnoDB AUTO_INCREMENT=63 DEFAULT CHARSET=utf8;

CREATE TABLE `NoteMapping` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `string` varchar(45) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `string_UNIQUE` (`string`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8;

CREATE TABLE `Settings` (
  `key` varchar(100) NOT NULL,
  `value` varchar(5000) DEFAULT NULL,
  `count` int(11) NOT NULL DEFAULT '1',
  PRIMARY KEY (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
