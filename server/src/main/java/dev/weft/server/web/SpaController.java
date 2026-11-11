package dev.weft.server.web;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

@Controller
public class SpaController {
    @GetMapping({"/d/{id}", "/d/{id}/"})
    public String document() { return "forward:/index.html"; }
}
